"""DataQs's other two inspection reasons: a copy request (about a listed inspection) and an
inspection missing from the carrier's record (described by the carrier, confirmed by STS)."""

from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsCase, DataQsIssue, User
from app.models.enums import DataQsOutcome, DataQsReason, DataQsWorkStatus
from app.services.dataqs_verification_service import (
    DataQsVerificationService,
    fmcsa_checkable,
    start_verification,
)
from tests.dataqs.helpers import (
    INSPECTION_ID,
    REPORT_NUMBER,
    USDOT,
    create_case,
    log_in,
)

MISSING = {
    "state": "ok",
    "report_number": " okr0042 ",
    "inspection_date": (date.today() - timedelta(days=40)).isoformat(),
    "level": 1,
    "location": "Tulsa",
    "factual_basis": "Clean level 1 inspection in Tulsa; the officer gave us the report.",
}
MISSING_URL = f"/api/v1/portal/dataqs/carriers/{USDOT}/missing-inspections"


def test_intake_offers_the_copy_request_for_the_whole_inspection_only(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "owner@acme.test")
    check = api.get(f"/api/v1/portal/dataqs/carriers/{USDOT}/inspections/{INSPECTION_ID}/check")
    reasons = {r["reason"]: r for r in check.json()["reasons"]}
    assert "MISSING_INSPECTION" not in reasons  # a listed inspection isn't missing
    copy = reasons["COPY_REQUEST"]
    assert copy["whole_inspection_only"] is True
    assert copy["dataqs_label"] == "Did not receive a copy or lost the inspection"

    copy_issue = {"violation_index": None, "reason": "COPY_REQUEST", "factual_basis": "x" * 25}
    on_a_violation = api.post(
        f"/api/v1/portal/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": [{**copy_issue, "violation_index": 1}]},
        headers={"Idempotency-Key": "copy-1"},
    )
    assert on_a_violation.status_code == 422 and "whole inspection" in on_a_violation.text
    missing_here = api.post(
        f"/api/v1/portal/dataqs/carriers/{USDOT}/cases",
        json={
            "inspection_id": INSPECTION_ID,
            "issues": [{**copy_issue, "reason": "MISSING_INSPECTION"}],
        },
        headers={"Idempotency-Key": "copy-2"},
    )
    assert missing_here.status_code == 422
    assert create_case(api, key="copy-3", issues=[copy_issue])["issues"][0]["reason"] == (
        "COPY_REQUEST"
    )


def test_a_missing_inspection_is_described_by_the_carrier(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "owner@acme.test")
    opened = api.post(MISSING_URL, json=MISSING, headers={"Idempotency-Key": "miss-1"})
    assert opened.status_code == 201, opened.text
    case = opened.json()
    assert case["work_status"] == "DRAFT"
    assert (case["inspection_report_number"], case["event_state"]) == ("OKR0042", "OK")
    assert case["event"]["inspection_id"] == ""  # not in FMCSA's data
    [issue] = case["issues"]
    assert issue["reason"] == "MISSING_INSPECTION" and issue["violation_code"] is None
    assert case["eligibility"]["status"] == "POTENTIALLY_ELIGIBLE"

    # The same key answers the same case; a second request on it is refused.
    again = api.post(MISSING_URL, json=MISSING, headers={"Idempotency-Key": "miss-1"})
    assert again.json()["id"] == case["id"]
    second = api.post(MISSING_URL, json=MISSING, headers={"Idempotency-Key": "miss-2"})
    assert second.status_code == 409

    # One that is on the record already starts from the list instead.
    listed = {**MISSING, "state": "TX", "report_number": REPORT_NUMBER}
    on_record = api.post(MISSING_URL, json=listed, headers={"Idempotency-Key": "miss-3"})
    assert on_record.status_code == 422 and "already on your record" in on_record.text

    future = {**MISSING, "inspection_date": (date.today() + timedelta(days=2)).isoformat()}
    assert api.post(MISSING_URL, json=future).status_code == 422
    log_in(api, "viewer@acme.test")
    assert api.post(MISSING_URL, json=MISSING).status_code == 403


def test_what_is_verified_for_each_new_reason(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    log_in(api, "owner@acme.test")
    case_id = api.post(MISSING_URL, json=MISSING).json()["id"]
    case = db.get(DataQsCase, case_id)
    assert case is not None and not fmcsa_checkable(case)
    [issue] = db.scalars(select(DataQsIssue).where(DataQsIssue.case_id == case_id))

    # Approved: STS confirms by hand once the record shows it; FMCSA's file isn't checked.
    issue.outcome = DataQsOutcome.FULL_CORRECTION
    start_verification(issue)
    case.work_status = DataQsWorkStatus.VERIFICATION
    db.commit()
    assert issue.verification_status == "MANUAL" and "wasn't in FMCSA" in issue.verification_note
    assert case_id not in DataQsVerificationService(db).due_cases()
    log_in(api, "analyst@sts.test")
    staff = api.get(f"/api/v1/dataqs/cases/{case_id}").json()
    assert staff["can_verify"] is True and staff["can_check_fmcsa"] is False
    assert api.post(f"/api/v1/dataqs/cases/{case_id}/verification/check").status_code == 409

    # A copy request changes no record: nothing to verify.
    issue.reason = DataQsReason.COPY_REQUEST
    start_verification(issue)
    assert issue.verification_status is None
