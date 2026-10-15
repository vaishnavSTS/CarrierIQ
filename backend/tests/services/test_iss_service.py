"""Estimated ISS: monthly tables, scheduling, a carrier's estimate, and what clients see
(requires TEST_DATABASE_URL)."""

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.intelligence.iss_estimate import VERSION
from app.jobs.handlers import BUILD_ISS_REFERENCE
from app.jobs.queue import PostgresJobQueue
from app.jobs.scheduler import schedule_iss_reference
from app.models import IssReference, IssSnapshot, SmsResult
from app.schemas.carrier_safety import CarrierSafetyOut
from app.services.client_view import client_safety
from app.services.iss_service import build_iss_reference, iss_for, iss_history, snapshot_all
from tests.factories import make_carrier, make_raw_record

FIXTURES = Path(__file__).parents[1] / "fixtures" / "iss"
TABLES: dict[str, Any] = json.loads((FIXTURES / "reference_2026_10.json").read_text())
MAJHA: dict[str, Any] = next(
    r
    for r in json.loads((FIXTURES / "carriers_2026_10.json").read_text())
    if r["dot_number"] == "4157195"
)


def store_tables(db: Session, month: date = date(2026, 10, 1)) -> None:
    db.add(
        IssReference(
            data_month=month, version=VERSION, dataset_id="4y6x-dmck", carriers=1, tables=TABLES
        )
    )
    db.flush()


def load_majha(db: Session) -> None:
    carrier = make_carrier(db, 4157195, "MAJHA CORPORATION")
    raw = make_raw_record(db, "4157195")
    for basic in ("unsafe_driv", "hos_driv", "driv_fit", "contr_subst", "veh_maint"):
        db.add(
            SmsResult(
                carrier_id=carrier.id,
                snapshot_month=date(2026, 10, 1),
                dataset_id="4y6x-dmck",
                dataset="SMS AB PassProperty",
                passenger=False,
                inspections=int(MAJHA["insp_total"]),
                driver_inspections=int(MAJHA["driver_insp_total"]),
                vehicle_inspections=int(MAJHA["vehicle_insp_total"]),
                basic=basic,
                label=basic,
                inspections_with_violation=int(MAJHA[f"{basic}_insp_w_viol"]),
                measure=Decimal(MAJHA[f"{basic}_measure"]),
                acute_critical=MAJHA[f"{basic}_ac"] == "Y",
                source="dot_socrata",
                raw_record_id=raw.id,
            )
        )
    db.flush()


def test_carrier_estimate_from_stored_sms_and_tables(db: Session) -> None:
    load_majha(db)
    assert iss_for(db, 4157195) is None  # no monthly tables yet

    store_tables(db)
    result = iss_for(db, 4157195)

    assert result is not None
    assert (result.value, result.band, result.group) == (55, "OPTIONAL", 12)  # real ISS 55
    assert result.data_month == date(2026, 10, 1)


def test_clients_see_threshold_flags_but_not_percentiles(db: Session) -> None:
    load_majha(db)
    store_tables(db)
    iss = iss_for(db, 4157195)
    # Only the estimate matters here; the rest of the Safety answer is left empty.
    safety = CarrierSafetyOut.model_construct(usdot_number=4157195, estimated_iss=iss)

    shown = client_safety(safety).estimated_iss

    assert shown is not None and shown.value == 55
    assert all(b.percentile is None for b in shown.basics)
    assert [b.basic for b in shown.basics if b.over_threshold] == ["unsafe_driv"]
    # Clients still see which BASICs FMCSA would assess (HOS: only 2 inspections with violations).
    assert [b.basic for b in shown.basics if b.assessed] == ["unsafe_driv"]


def test_each_new_result_is_saved_once_to_the_score_history(db: Session) -> None:
    load_majha(db)
    store_tables(db)

    iss_for(db, 4157195)
    iss_for(db, 4157195)  # same result: not saved again
    assert db.query(IssSnapshot).count() == 1

    store_tables(db, date(2026, 11, 1))  # next month's tables: a new point in the history
    iss_for(db, 4157195)

    history = iss_history(db, 4157195)
    assert [(h.value, h.band, h.data_month) for h in history] == [
        (55, "OPTIONAL", date(2026, 11, 1)),
        (55, "OPTIONAL", date(2026, 10, 1)),
    ]
    saved = db.query(IssSnapshot).order_by(IssSnapshot.id).first()
    assert saved is not None and saved.group == 12 and saved.version == VERSION
    assert {b["basic"] for b in saved.basics} >= {"unsafe_driv", "veh_maint"}


def test_snapshot_all_saves_every_stored_carrier(db: Session) -> None:
    load_majha(db)
    make_carrier(db, 1234567, "NO SMS YET LLC")
    store_tables(db)

    assert snapshot_all(db) == 2
    assert snapshot_all(db) == 2  # nothing changed: nothing more saved
    assert db.query(IssSnapshot).count() == 2
    assert iss_history(db, 7654321) == []  # not loaded


class FakeClient:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def get_all_rows(
        self, dataset_id: str, params: dict[str, str], order: str, page_size: int | None = None
    ) -> list[dict[str, Any]]:
        return self.rows


def test_build_stores_one_row_per_month(db: Session) -> None:
    rows = [MAJHA, {"dot_number": "1", "driver_insp_total": "4", "vehicle_insp_total": "0"}]

    assert build_iss_reference(db, date(2026, 10, 14), FakeClient(rows)) == 2  # type: ignore[arg-type]
    assert build_iss_reference(db, date(2026, 10, 20), FakeClient(rows)) == 2  # type: ignore[arg-type]

    stored = db.query(IssReference).all()
    assert [(r.data_month, r.carriers) for r in stored] == [(date(2026, 10, 1), 2)]


def test_scheduled_once_a_month(db: Session) -> None:
    queue = PostgresJobQueue(db)
    now = datetime(2026, 10, 14, tzinfo=UTC)

    assert schedule_iss_reference(db, queue, now) is True
    assert schedule_iss_reference(db, queue, now) is False  # already waiting

    store_tables(db, date(2026, 10, 1))
    assert schedule_iss_reference(db, queue, datetime(2026, 10, 20, tzinfo=UTC)) is False
    job = queue.claim("test")
    assert job is not None and job.job_type == BUILD_ISS_REFERENCE
