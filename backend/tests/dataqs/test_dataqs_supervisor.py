"""The supervisor view (Phase 6): exceptions across every case, workload, and the audit export."""

import csv
import io
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsCase, DataQsOutbox, User
from app.models.enums import DataQsOutboxStatus
from app.services.dataqs_clock_service import DataQsClockService
from app.services.dataqs_supervisor_service import DataQsSupervisorService, _safe
from tests.dataqs.helpers import (
    approved_case,
    confirm_filing,
    log_in,
    start_filing,
    submitted_case,
)


def _kinds(db: Session, now: datetime | None = None) -> dict[int, set[str]]:
    found: dict[int, set[str]] = {}
    for e in DataQsSupervisorService(db).overview(now).exceptions:
        found.setdefault(e.case_id, set()).add(e.kind)
    return found


def test_only_sts_admins_see_the_supervisor_view(api: TestClient, world: dict[str, User]) -> None:
    for email in ("analyst@sts.test", "owner@acme.test"):
        log_in(api, email)
        assert api.get("/api/v1/dataqs/supervisor").status_code == 403
        assert api.get("/api/v1/dataqs/supervisor/audit.csv").status_code == 403
    log_in(api, "admin@sts.test")
    view = api.get("/api/v1/dataqs/supervisor")
    assert view.status_code == 200, view.text
    # Staff with nothing assigned still show, so work can be shared out.
    names = {w["owner_name"] for w in view.json()["workload"]}
    assert names == {"Analyst", "Admin"}


def test_unassigned_case_and_workload(api: TestClient, world: dict[str, User], db: Session) -> None:
    case_id = submitted_case(api)["id"]
    view = DataQsSupervisorService(db).overview()
    assert "UNASSIGNED" in {e.kind for e in view.exceptions if e.case_id == case_id}
    [unassigned] = [w for w in view.workload if w.owner_id is None]
    assert unassigned.active_cases == 1 and unassigned.needs_sts == 1


def test_late_deadlines(api: TestClient, world: dict[str, User], db: Session) -> None:
    case = approved_case(api)
    attempt = start_filing(api, case).json()["attempts"][-1]["id"]
    assert confirm_filing(api, case, attempt).status_code == 200
    filed = db.get(DataQsCase, case["id"])
    assert filed is not None

    # The agency asked a question 20 days ago; STS had 14 days to answer.
    DataQsClockService(db).start_requester_info(filed, datetime.now(UTC) - timedelta(days=20))
    db.commit()
    now = datetime.now(UTC)
    assert "DEADLINE_OVERDUE" in _kinds(db, now)[filed.id]
    [load] = [w for w in DataQsSupervisorService(db).overview(now).workload if w.overdue_deadlines]
    assert load.overdue_deadlines == 1

    # A month on, the agency's 21 days are up too.
    later = now + timedelta(days=30)
    assert {"AGENCY_LATE", "DEADLINE_OVERDUE"} <= _kinds(db, later)[filed.id]


def test_closing_filing_window_and_stale_cases(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    # Not yet filed, close to the end of its 3-year window (inspection 2024-09-12), with nothing
    # happening for weeks.
    pending = submitted_case(api)["id"]
    near_end = datetime(2027, 9, 5, tzinfo=UTC)
    kinds = _kinds(db, near_end)[pending]
    assert {"WINDOW_CLOSING", "STALE"} <= kinds
    assert "WINDOW_PASSED" in _kinds(db, datetime(2027, 10, 1, tzinfo=UTC))[pending]


def test_failed_emails_are_listed(api: TestClient, world: dict[str, User], db: Session) -> None:
    case_id = submitted_case(api)["id"]
    log_in(api, "analyst@sts.test")
    api.post(
        f"/api/v1/dataqs/cases/{case_id}/messages",
        json={"subject": "Hello", "body": "Testing delivery"},
    )
    rows = list(db.scalars(select(DataQsOutbox).where(DataQsOutbox.case_id == case_id)))
    rows[0].status, rows[0].attempts, rows[0].last_error = (
        DataQsOutboxStatus.FAILED,
        5,
        "Gmail answered 400: Invalid To header",
    )
    db.commit()
    [failed] = [
        e for e in DataQsSupervisorService(db).overview().exceptions if e.kind == "EMAIL_FAILED"
    ]
    assert failed.case_id == case_id and "Invalid To header" in failed.detail


def test_audit_export_is_a_csv_of_every_event(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id = submitted_case(api)["id"]
    log_in(api, "admin@sts.test")
    export = api.get("/api/v1/dataqs/supervisor/audit.csv")
    assert export.status_code == 200, export.text
    assert export.headers["content-type"].startswith("text/csv")
    assert "attachment" in export.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(export.text)))
    mine = [r for r in rows if r["case_id"] == str(case_id)]
    assert mine and mine[0]["company"] == "Acme" and mine[0]["actor"] == "owner@acme.test"

    bad = api.get("/api/v1/dataqs/supervisor/audit.csv?since=2026-02-01&until=2026-01-01")
    assert bad.status_code == 422


def test_csv_cells_never_run_as_formulas() -> None:
    assert _safe("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert _safe("-1") == "'-1"
    assert _safe("case.created") == "case.created"
