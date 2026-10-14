"""Estimated ISS: the monthly lookup tables and one carrier's estimate (docs/estimated-iss-v1.md).

`build_iss_reference` downloads FMCSA's national SMS property file (~677,000 carriers, a couple
of minutes) and the SMS Input crash file with the census facts of carriers with two or more
crashes (the Crash Indicator), turns them into lookup tables and stores them for the month.
`iss_for` reads a carrier's own SMS row (already ingested on refresh), the newest tables and any
active out-of-service order, and returns the estimate for the Safety tab.
"""

import logging
from collections import defaultdict
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.registration_orders import RegistrationOrdersAdapter
from app.ingestion.socrata_client import SocrataClient
from app.intelligence.iss_estimate import (
    FLEET_COLUMNS,
    VERSION,
    BasicResult,
    CarrierFacts,
    CarrierSms,
    SmsBasic,
    build_reference,
    crash_basic,
    estimate,
    is_straight,
    with_crash,
)
from app.models import Carrier, Inspection, IssReference
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
CENSUS_COLUMNS = ",".join(["dot_number", "power_units", "total_drivers", *FLEET_COLUMNS])
CRASH_COLUMNS = "dot_number,report_number,severity_weight,time_weight"
SMS_CENSUS_COLUMNS = "dot_number,nbr_power_unit,recent_mileage"
PAGE_SIZE = 50_000
DOTS_PER_REQUEST = 400
VEHICLE_LEVELS = (1, 2, 5, 6)
DRIVER_LEVELS = (1, 2, 3, 6)
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
        # Active carriers' fleet sizes (insufficient-data inspection-rate ranking) and vehicle
        # types (combination / straight segment for Unsafe Driving and the Crash Indicator).
        census = client.get_all_rows(
            settings.census_dataset_id,
            {"$select": CENSUS_COLUMNS, "$where": "status_code='A'"},
            order="dot_number",
            page_size=PAGE_SIZE,
        )
        fleets = {str(r.get("dot_number")): r for r in census}
        crashes = _crash_basics(client, fleets)
    finally:
        if own_client:
            client.close()

    month = month_start(today)
    sizes = {
        str(r.get("dot_number")): (_number(r.get("power_units")), _number(r.get("total_drivers")))
        for r in census
    }
    straight = {dot for dot, fleet in fleets.items() if is_straight(fleet)}
    tables = build_reference(rows, month.isoformat()[:7], sizes, crashes, straight)
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


def _by_dot(
    client: SocrataClient, dataset: str, columns: str, dots: Sequence[str]
) -> dict[str, Any]:
    """Rows of `dataset` for these carriers, a few hundred USDOT numbers per request."""
    found: dict[str, Any] = {}
    for i in range(0, len(dots), DOTS_PER_REQUEST):
        ids = ",".join(f"'{d}'" for d in dots[i : i + DOTS_PER_REQUEST])
        params = {"$select": columns, "$where": f"dot_number in ({ids})"}
        for row in client.get_all_rows(dataset, params, order="dot_number"):
            found[str(row.get("dot_number"))] = row
    return found


def _crash_basics(client: SocrataClient, fleets: dict[str, Any]) -> dict[str, SmsBasic]:
    """Every carrier's Crash Indicator measure from FMCSA's SMS Input files (crash weights,
    average power units, recent mileage) and the census fleet (combination or straight)."""
    settings = get_settings()
    weights: dict[str, dict[str, tuple[float, int]]] = defaultdict(dict)
    for row in client.get_all_rows(
        settings.sms_crash_dataset_id,
        {"$select": CRASH_COLUMNS},
        order="dot_number,report_number",
        page_size=PAGE_SIZE,
    ):
        severity, time = row.get("severity_weight"), row.get("time_weight")
        if severity and time:  # unweighted: found not preventable, excluded by FMCSA
            weights[str(row.get("dot_number"))][str(row.get("report_number"))] = (
                _number(severity),
                int(_number(time)),
            )
    dots = sorted(d for d, reports in weights.items() if len(reports) >= 2)
    census = _by_dot(client, settings.sms_census_dataset_id, SMS_CENSUS_COLUMNS, dots)
    basics = {}
    for dot in dots:
        facts = census.get(dot, {})
        basic = crash_basic(
            list(weights[dot].values()),
            _number(facts.get("nbr_power_unit")),
            _number(facts.get("recent_mileage")),
            is_straight(fleets.get(dot, {})),
        )
        if basic is not None:
            basics[dot] = basic
    return basics


def _number(value: object) -> float:
    try:
        return float(value or 0)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def _carrier_facts(db: Session, carrier: Carrier, today: date) -> CarrierFacts:
    """Census facts and the carrier's own inspections in the last 24 months."""
    census = RawRecordRepository(db).latest(
        CompanyCensusAdapter.source, get_settings().census_dataset_id, str(carrier.usdot_number)
    )
    operation = str((census.payload if census else {}).get("carrier_operation") or "")
    since = today - timedelta(days=730)
    recent = [
        i
        for i in db.scalars(select(Inspection).where(Inspection.carrier_id == carrier.id))
        if i.inspection_date >= since
    ]

    def with_violation(levels: tuple[int, ...]) -> int:
        return sum(
            1
            for i in recent
            if i.inspection_level in levels and (i.violation_data or {}).get("viol_total", 0) > 0
        )

    return CarrierFacts(
        power_units=carrier.fleet_size,
        drivers=carrier.driver_count,
        interstate=operation.upper() == "A" if operation else None,
        registered=carrier.first_registered_date,
        vehicle_inspections_with_violation=with_violation(VEHICLE_LEVELS),
        driver_inspections_with_violation=with_violation(DRIVER_LEVELS),
    )


def _straight(db: Session, usdot_number: int) -> bool:
    """Whether the carrier is in FMCSA's straight-truck segment, from its census fleet."""
    census = RawRecordRepository(db).latest(
        CompanyCensusAdapter.source, get_settings().census_dataset_id, str(usdot_number)
    )
    return is_straight(census.payload) if census else False


def _carrier_sms(
    db: Session, carrier_id: int, straight: bool = False
) -> tuple[CarrierSms | None, bool]:
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
                    straight=straight and r.basic == "unsafe_driv",
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
    sms, passenger = _carrier_sms(db, carrier.id, _straight(db, usdot_number))
    if passenger:
        return EstimatedIssOut(
            value=None,
            band=None,
            group=None,
            reason="Passenger carriers are not estimated yet (v1 covers property carriers)",
            basics=[],
            data_month=reference.data_month,
            version=VERSION,
            algorithm="NONE",
        )
    if sms is not None:
        sms = with_crash(sms, reference.tables, str(usdot_number))
    today = date.today()
    result = estimate(
        sms,
        reference.tables,
        _active_oos_order(db, usdot_number),
        _carrier_facts(db, carrier, today),
        today,
    )
    return EstimatedIssOut(
        value=result.value,
        band=result.band,
        group=result.group,
        reason=result.reason,
        basics=[_basic_out(r) for r in result.basics],
        data_month=reference.data_month,
        version=result.version,
        algorithm=result.algorithm,
    )
