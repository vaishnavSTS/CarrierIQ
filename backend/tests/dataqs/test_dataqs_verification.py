"""Checking FMCSA's data for approved corrections (Phase 6): an approval is never shown as a
verified correction before the data changes."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models import DataQsCase, Inspection, User
from app.services.dataqs_supervisor_service import DataQsSupervisorService
from app.services.dataqs_verification_service import (
    DataQsVerificationService,
    FmcsaRecord,
    comparable,
    differences,
    get_fmcsa_source,
)
from tests.dataqs.helpers import INSPECTION_ID, ISSUE, USDOT, log_in, staff_case
from tests.dataqs.test_dataqs_lifecycle import _filed, _ok, _record


class FakeFmcsa:
    """FMCSA's inspection file, as the test sets it; a refresh copies it into CarrierSafetyScan."""

    def __init__(self, record: FmcsaRecord | None = None) -> None:
        self.record = record
        self.error: Exception | None = None
        self.refreshed: list[int] = []

    def inspection(self, inspection_id: str) -> FmcsaRecord | None:
        if self.error:
            raise self.error
        return self.record

    def refresh_carrier(self, db: Session, usdot_number: int) -> None:
        self.refreshed.append(usdot_number)
        local = db.scalar(select(Inspection).where(Inspection.inspection_id == INSPECTION_ID))
        assert local is not None and self.record is not None
        local.violation_data = {
            **(local.violation_data or {}),
            "violations": self.record.event["violations"],
        }
        db.commit()


def fmcsa(case: dict, drop: tuple[int, ...] = (), usdot: int = USDOT, **changed: object):
    """FMCSA's copy of the case's inspection, without the violations at `drop`."""
    e = case["event"]
    violations = [{**v, **changed} for i, v in enumerate(e["violations"]) if i not in drop]
    return FmcsaRecord(
        usdot, comparable(e["inspection_date"], e["level"], e["state"], e["location"], violations)
    )


def decided(api: TestClient, issues: list[dict] | None = None, corrected: bool = True) -> dict:
    """A filed case the agency decided 5 minutes ago, every issue corrected."""
    case = _filed(api, issues)
    outcome = "CORRECTED" if corrected else "NOT_CORRECTED"
    return _ok(
        _record(
            api,
            case,
            "DECISION",
            5,
            decision={
                "issue_outcomes": {str(i["id"]): outcome for i in case["issues"]},
                "decided_by": "Officer A. Reyes",
            },
        )
    )


def check(db: Session, case: dict, source: FakeFmcsa, now: datetime | None = None) -> None:
    row = db.get(DataQsCase, case["id"])
    assert row is not None
    DataQsVerificationService(db, source).check(row, now)


def carrier_view(api: TestClient, case_id: int) -> dict:
    log_in(api, "owner@acme.test")
    view = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    log_in(api, "analyst@sts.test")
    return view


def test_an_approval_is_not_verified_until_fmcsa_changes(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = decided(api)
    [issue] = case["issues"]
    assert case["work_status"] == "VERIFICATION"
    assert issue["verification_status"] == "WAITING" and issue["verified_at"] is None
    assert case["can_verify"] is True

    source = FakeFmcsa(fmcsa(case))  # FMCSA hasn't changed it yet
    check(db, case, source)
    case = staff_case(api, case["id"])
    assert case["issues"][0]["verification_status"] == "WAITING"
    assert case["verification_checked_at"] is not None
    assert [c["changes"] for c in case["verification_checks"]] == [[]]
    assert source.refreshed == []

    source.record = fmcsa(case, drop=(1,))  # the brake violation is gone
    check(db, case, source)
    case = staff_case(api, case["id"])
    [issue] = case["issues"]
    assert issue["verification_status"] == "VERIFIED" and issue["verified_by_name"] is None
    assert issue["verification_note"] == "Violation 396.3A1BOS (unit 1) is no longer listed."
    # CarrierSafetyScan's copy was refreshed and now matches FMCSA's.
    assert source.refreshed == [USDOT] and issue["shown_at"] is not None
    assert case["verification_checks"][0]["changes"] == ["Violation 396.3A1BOS (unit 1) removed"]
    kinds = {t["kind"] for t in case["tasks"]}
    assert "CLOSE_VERIFIED" in kinds and "VERIFY_CORRECTION" not in kinds
    assert case["can_verify"] is False

    carrier = carrier_view(api, case["id"])
    assert carrier["issues"][0]["verification_status"] == "VERIFIED"
    assert carrier["messages"][0]["subject"].startswith("FMCSA's record shows the correction")

    # Nothing left to check: no more daily looks.
    assert case["id"] not in DataQsVerificationService(db).due_cases()


def test_changes_needing_a_person_and_driver_details(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    driver = {**ISSUE, "violation_index": 0, "reason": "DRIVER_INCORRECT"}
    case = decided(api, [driver, ISSUE])
    lamp, brakes = case["issues"]
    assert (lamp["verification_status"], brakes["verification_status"]) == ("MANUAL", "WAITING")

    # The brake violation is still listed, but no longer out of service.
    check(db, case, FakeFmcsa(fmcsa(case, out_of_service=False)))
    case = staff_case(api, case["id"])
    lamp, brakes = case["issues"]
    assert lamp["verification_status"] == "MANUAL"
    assert brakes["verification_status"] == "REVIEW"
    assert "out of service changed from yes to no" in brakes["verification_note"]
    hand = [e for e in DataQsSupervisorService(db).overview().exceptions if e.case_id == case["id"]]
    assert sum(e.kind == "VERIFY_BY_HAND" for e in hand) == 2

    for issue in (lamp, brakes):
        confirmed = api.post(
            f"/api/v1/dataqs/cases/{case['id']}/issues/{issue['id']}/verification",
            json={"note": "PSP report pulled Oct 22 shows the corrected record."},
        )
        assert confirmed.status_code == 200, confirmed.text
    case = confirmed.json()
    assert {i["verification_status"] for i in case["issues"]} == {"VERIFIED"}
    assert {i["verified_by_name"] for i in case["issues"]} == {"Analyst"}
    again = api.post(
        f"/api/v1/dataqs/cases/{case['id']}/issues/{lamp['id']}/verification",
        json={"note": "Confirming twice"},
    )
    assert again.status_code == 409

    # The carrier sees it confirmed by STS, not STS's own proof.
    carrier = carrier_view(api, case["id"])
    assert {i["verification_note"] for i in carrier["issues"]} == {None}


def test_a_removed_inspection_and_one_that_may_have_aged_out(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = decided(api, [{**ISSUE, "reason": "WRONG_CARRIER"}])
    source = FakeFmcsa(fmcsa(case))
    check(db, case, source)
    assert staff_case(api, case["id"])["issues"][0]["verification_status"] == "WAITING"

    # Near the end of the three-year window a missing inspection may simply have aged out.
    source.record = None
    check(db, case, source, now=datetime(2027, 9, 1, tzinfo=UTC))
    issue = staff_case(api, case["id"])["issues"][0]
    assert issue["verification_status"] == "REVIEW" and "ageing out" in issue["verification_note"]

    # Today, it means FMCSA took it off the carrier: verified, and gone from CarrierSafetyScan.
    source.record = fmcsa(case, usdot=1111111)
    check(db, case, source)
    issue = staff_case(api, case["id"])["issues"][0]
    assert issue["verification_status"] == "VERIFIED"
    assert issue["verification_note"] == "The inspection is now listed under USDOT 1111111."
    assert issue["shown_at"] is not None
    assert db.scalar(select(Inspection).where(Inspection.inspection_id == INSPECTION_ID)) is None


def test_failing_checks_and_a_correction_never_seen_are_escalated(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = decided(api)
    service = DataQsVerificationService(db)
    assert service.due_cases() == [case["id"]]

    source = FakeFmcsa()
    source.error = TimeoutError("FMCSA timed out")
    start = datetime.now(UTC)
    check(db, case, source, now=start)
    assert staff_case(api, case["id"])["verification_error"] == "FMCSA timed out"
    assert carrier_view(api, case["id"])["verification_error"] is None
    # A failed look is tried again within the hour, not the next day.
    assert service.due_cases(start + timedelta(minutes=30)) == []
    assert service.due_cases(start + timedelta(hours=1)) == [case["id"]]

    kinds = {
        e.kind
        for e in DataQsSupervisorService(db).overview(start + timedelta(days=4)).exceptions
        if e.case_id == case["id"]
    }
    assert "VERIFICATION_CHECK_FAILING" in kinds and "STALE" not in kinds

    source.error, source.record = None, fmcsa(case)
    check(db, case, source, now=start + timedelta(days=1))
    assert service.due_cases(start + timedelta(days=1, hours=23)) == []
    assert service.due_cases(start + timedelta(days=2)) == [case["id"]]
    late = DataQsSupervisorService(db).overview(start + timedelta(days=61)).exceptions
    [not_seen] = [e for e in late if e.kind == "CORRECTION_NOT_SEEN"]
    assert not_seen.severity == "HIGH" and "approved 61 days ago" in not_seen.detail


def test_closing_before_fmcsa_shows_the_correction_needs_a_reason(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = decided(api)
    url = f"/api/v1/dataqs/cases/{case['id']}/close"
    body = {"expected_version": case["row_version"], "note": "Closing the file now."}
    refused = api.post(url, json=body)
    assert refused.status_code == 422 and "Say why" in refused.text
    closed = api.post(url, json={**body, "unverified_reason": "Confirmed by phone with DPS."})
    assert closed.status_code == 200, closed.text
    audit = [a for a in closed.json()["audit"] if a["action"] == "case.closed"]
    assert audit[-1]["detail"]["unverified_reason"] == "Confirmed by phone with DPS."


@pytest.fixture
def fake_fmcsa() -> Iterator[FakeFmcsa]:
    source = FakeFmcsa()
    app.dependency_overrides[get_fmcsa_source] = lambda: source
    yield source
    app.dependency_overrides.pop(get_fmcsa_source, None)


def test_staff_can_check_now(
    api: TestClient, world: dict[str, User], db: Session, fake_fmcsa: FakeFmcsa
) -> None:
    case = decided(api)
    fake_fmcsa.record = fmcsa(case, drop=(1,))
    url = f"/api/v1/dataqs/cases/{case['id']}/verification/check"
    log_in(api, "owner@acme.test")
    assert api.post(url).status_code == 403
    log_in(api, "analyst@sts.test")
    checked = api.post(url)
    assert checked.status_code == 200, checked.text
    assert checked.json()["issues"][0]["verification_status"] == "VERIFIED"
    assert api.post(url).status_code == 409  # nothing left to check


def test_a_denied_issue_has_nothing_to_verify(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = decided(api, corrected=False)
    assert case["issues"][0]["verification_status"] is None and case["can_verify"] is False
    assert DataQsVerificationService(db).due_cases() == []


def test_differences_in_words() -> None:
    lamp = {"code": "393.9A", "applies_to": "VEHICLE", "unit_number": 1, "out_of_service": False}
    seat = {"code": "392.16", "applies_to": "DRIVER", "unit_number": None}
    before = comparable("2024-09-12", 1, "TX", "Waco", [lamp, seat])
    after = comparable("2024-09-12", 2, "TX", "Waco", [{**lamp, "out_of_service": True}])
    assert differences(before, after) == [
        "Level changed from 1 to 2",
        "Violation 392.16 (driver) removed",
        "Violation 393.9A (unit 1): out of service changed from no to yes",
    ]
