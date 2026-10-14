"""Estimated ISS: the monthly lookup tables and one carrier's estimate (docs/estimated-iss-v1.md).

`build_iss_reference` downloads FMCSA's national SMS property file (~677,000 carriers, a couple
of minutes), turns it into lookup tables and stores them for the month. `iss_for` reads a
carrier's own SMS row (already ingested on refresh), the newest tables and any active
out-of-service order, and returns the estimate for the Safety tab.
"""

import logging
from datetime import date

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.registration_orders import RegistrationOrdersAdapter
from app.ingestion.socrata_client import SocrataClient
from app.intelligence.iss_estimate import (
    VERSION,
    BasicResult,
    CarrierSms,
    SmsBasic,
    build_reference,
    estimate,
)
from app.models import IssReference
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.safety_record_repository import SafetyRecordRepository
from app.schemas.carrier_safety import EstimatedIssBasicOut, EstimatedIssOut

logger = logging.getLogger(__name__)

# Columns of FMCSA's SMS file the estimate needs (data.transportation.gov names).
SMS_COLUMNS = ",".join(
    ["dot_number", "driver_insp_total", "vehicle_insp_total"]
    + [
        f"{basic}_{part}"
        for basic in ("unsafe_driv", "hos_driv", "driv_fit", "contr_subst", "veh_maint")
        for part in ("measure", "insp_w_viol", "ac")
    ]
)
PAGE_SIZE = 50_000
DOWNLOAD_TIMEOUT_SECONDS = 300.0


def month_start(day: date) -> date:
    return day.replace(day=1)


def latest_reference(db: Session) -> IssReference | None:
    return db.scalar(select(IssReference).order_by(IssReference.data_month.desc()).limit(1))


def build_iss_reference(db: Session, today: date, client: SocrataClient | None = None) -> int:
    """Download FMCSA's national SMS property file and store this month's lookup tables
    (replacing any built earlier this month). Returns the number of carriers in the file."""
    settings = get_settings()
    own_client = client is None
    if client is None:
        headers = {"Accept": "application/json"}
        if settings.socrata_app_token:
            headers["X-App-Token"] = settings.socrata_app_token
        client = SocrataClient(
            httpx.Client(
                base_url=settings.socrata_base_url,
                headers=headers,
                timeout=DOWNLOAD_TIMEOUT_SECONDS,
            )
        )
    try:
        dataset = settings.sms_ab_property_dataset_id
        rows = client.get_all_rows(
            dataset, {"$select": SMS_COLUMNS}, order="dot_number", page_size=PAGE_SIZE
        )
    finally:
        if own_client:
            client.close()

    month = month_start(today)
    tables = build_reference(rows, month.isoformat()[:7])
    existing = db.scalar(select(IssReference).where(IssReference.data_month == month))
    if existing is None:
        db.add(
            IssReference(
                data_month=month,
                version=VERSION,
                dataset_id=dataset,
                carriers=len(rows),
                tables=tables,
            )
        )
    else:
        existing.version, existing.carriers, existing.tables = VERSION, len(rows), tables
    db.commit()
    logger.info("Estimated ISS tables for %s built from %d carriers", month, len(rows))
    return len(rows)


def _carrier_sms(db: Session, carrier_id: int) -> tuple[CarrierSms | None, bool]:
    """(the carrier's newest SMS row, whether it is a passenger carrier)."""
    rows = SafetyRecordRepository(db).latest_sms(carrier_id)
    if not rows:
        return None, False
    first = rows[0]
    return (
        CarrierSms(
            driver_inspections=first.driver_inspections,
            vehicle_inspections=first.vehicle_inspections,
            basics={
                r.basic: SmsBasic(
                    measure=float(r.measure or 0),
                    inspections_with_violation=r.inspections_with_violation,
                    acute_critical=bool(r.acute_critical),
                )
                for r in rows
            },
        ),
        first.passenger,
    )


def _active_oos_order(db: Session, usdot_number: int) -> bool:
    record = RawRecordRepository(db).latest(
        RegistrationOrdersAdapter.source, get_settings().oos_orders_dataset_id, str(usdot_number)
    )
    rows = record.payload.get("rows", []) if record else []
    return any(str(row.get("status", "")).upper() == "ACTIVE" for row in rows)


def _basic_out(r: BasicResult) -> EstimatedIssBasicOut:
    return EstimatedIssBasicOut(
        basic=r.basic,
        label=r.label,
        percentile=r.percentile,
        assessed=r.percentile is not None,
        threshold=r.threshold,
        over_threshold=r.over_threshold,
    )


def iss_for(db: Session, usdot_number: int) -> EstimatedIssOut | None:
    """The carrier's Estimated ISS; None when the carrier or the monthly tables aren't loaded."""
    carrier = CarrierRepository(db).get_by_usdot(usdot_number)
    reference = latest_reference(db)
    if carrier is None or reference is None:
        return None
    sms, passenger = _carrier_sms(db, carrier.id)
    if passenger:
        return EstimatedIssOut(
            value=None,
            band=None,
            group=None,
            reason="Passenger carriers are not estimated yet (v1 covers property carriers)",
            basics=[],
            data_month=reference.data_month,
            version=VERSION,
        )
    result = estimate(sms, reference.tables, _active_oos_order(db, usdot_number))
    return EstimatedIssOut(
        value=result.value,
        band=result.band,
        group=result.group,
        reason=result.reason,
        basics=[_basic_out(r) for r in result.basics],
        data_month=reference.data_month,
        version=result.version,
    )
