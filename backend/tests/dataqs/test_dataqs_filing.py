"""DataQs Phase 4 through the API: manual filing. Start an attempt, confirm it with the DataQs
request ID and acknowledgement, or settle an unconfirmed one; never file the same request twice."""

from datetime import UTC, datetime, timedelta

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DataQsCorrespondence, DataQsReviewCycle, User
from tests.dataqs.helpers import (
    ISSUE,
    approve,
    assess,
    build,
    create_case,
    log_in,
    ready_package,
    staff_case,
    submit,
)

ACK = "Your request has been submitted. Request #RDR-2026-001234"


def _approved(api: TestClient) -> dict:
    """A case whose package v1 the carrier approved: READY_TO_FILE, seen by STS staff."""
    case_id, _ = ready_package(api)
    log_in(api, "owner@acme.test")
    case = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert approve(api, case, case["packages"][0]).status_code == 200
    log_in(api, "analyst@sts.test")
    return staff_case(api, case_id)


def _start(api: TestClient, case: dict, key: str = "file-1") -> httpx.Response:
    package = case["packages"][0]
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/submission-attempts",
        json={
            "package_id": package["id"],
            "package_hash": package["manifest_hash"],
            "filing_account": "STS DataQs account (Analyst)",
        },
        headers={"Idempotency-Key": key},
    )


def _confirm(
    api: TestClient, case: dict, attempt_id: int, gov_id: str = "RDR-2026-001234", **extra: object
) -> httpx.Response:
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/submission-attempts/{attempt_id}/confirm",
        json={
            "gov_request_id": gov_id,
            "filed_at": datetime.now(UTC).isoformat(),
            "assigned_agency": "Texas DPS",
            "acknowledgement": ACK,
            "package_version": 1,
            "portal_status": "Submitted",
            **extra,
        },
    )


def _post(api: TestClient, case: dict, attempt_id: int, action: str, note: str) -> httpx.Response:
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/submission-attempts/{attempt_id}/{action}",
        json={"note": note},
    )


def test_filing_is_recorded_once_with_its_receipt(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = _approved(api)
    assert case["can_file"] is True

    started = _start(api, case)
    assert started.status_code == 201, started.text
    case = started.json()
    [attempt] = case["attempts"]
    assert (attempt["status"], attempt["package_version"]) == ("STARTED", 1)
    assert case["work_status"] == "READY_TO_FILE" and case["can_file"] is False
    assert _start(api, case).json()["attempts"][0]["id"] == attempt["id"]  # same key: no new one

    confirmed = _confirm(api, case, attempt["id"])
    assert confirmed.status_code == 200, confirmed.text
    case = confirmed.json()
    assert (case["work_status"], case["action_owner"], case["review_level"]) == (
        "MONITORING",
        "AGENCY",
        "INITIAL",
    )
    assert (case["gov_request_id"], case["government_raw_status"]) == (
        "RDR-2026-001234",
        "Submitted",
    )
    assert case["attempts"][0]["acknowledgement"] == ACK
    assert [c["level"] for c in case["review_cycles"]] == ["INITIAL"]
    [task] = case["tasks"]
    assert task["kind"] == "CHECK_OPENED"  # the agency should open it within 7 days

    again = _confirm(api, case, attempt["id"])  # a repeated confirm adds nothing
    assert again.status_code == 200
    for model in (DataQsReviewCycle, DataQsCorrespondence):
        count = db.scalar(
            select(func.count()).select_from(model).where(model.case_id == case["id"])
        )
        assert count == 1, model.__name__
    other_id = _confirm(api, case, attempt["id"], gov_id="RDR-2026-999999")
    assert other_id.status_code == 409

    log_in(api, "owner@acme.test")
    carrier = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    assert carrier["gov_request_id"] == "RDR-2026-001234"
    [seen] = carrier["attempts"]
    assert seen["acknowledgement"] is None and seen["filing_account"] is None  # STS details


def test_no_filing_without_the_carriers_approval(api: TestClient, world: dict[str, User]) -> None:
    case_id, _ = ready_package(api)  # built, not approved yet
    case = staff_case(api, case_id)
    assert case["can_file"] is False
    response = _start(api, case)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "dataqs_invalid_transition"


def test_starting_with_another_package_is_refused(api: TestClient, world: dict[str, User]) -> None:
    case = _approved(api)
    stale = {**case, "packages": [{**case["packages"][0], "manifest_hash": "0" * 64}]}
    response = _start(api, stale)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "dataqs_stale_version"


def test_an_unconfirmed_attempt_blocks_a_blind_retry_until_settled(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _approved(api)
    attempt_id = _start(api, case).json()["attempts"][0]["id"]

    unsure = _post(api, case, attempt_id, "unconfirmed", "Portal timed out after Submit")
    assert unsure.status_code == 200, unsure.text
    case = unsure.json()
    assert case["work_status"] == "SUBMISSION_UNCONFIRMED"
    # Filing is still owed, and first the open attempt must be checked against DataQs.
    assert [t["kind"] for t in case["tasks"]] == ["FILE_REQUEST", "RECONCILE_FILING"]
    retry = _start(api, case, key="file-2")
    assert retry.status_code == 409  # blocked until the open attempt is settled
    assert build(api, case).status_code == 409  # and the package can't change meanwhile

    not_found = _post(api, case, attempt_id, "abandon", "Searched DataQs: no request for it")
    assert not_found.json()["work_status"] == "READY_TO_FILE"
    second = _start(api, not_found.json(), key="file-2")
    assert second.status_code == 201
    second_id = second.json()["attempts"][-1]["id"]
    assert _confirm(api, second.json(), second_id).json()["work_status"] == "MONITORING"


def test_reconciling_finds_the_request_and_confirms_it(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _approved(api)
    attempt_id = _start(api, case).json()["attempts"][0]["id"]
    case = _post(api, case, attempt_id, "unconfirmed", "Browser closed after Submit").json()
    found = _confirm(api, case, attempt_id)
    assert found.status_code == 200, found.text
    assert found.json()["work_status"] == "MONITORING"
    assert found.json()["tasks"][0]["kind"] == "CHECK_OPENED"  # the reconcile task is done


def test_the_receipt_must_match_the_filing(api: TestClient, world: dict[str, User]) -> None:
    case = _approved(api)
    attempt_id = _start(api, case).json()["attempts"][0]["id"]
    assert _confirm(api, case, attempt_id, package_version=2).status_code == 422
    future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    assert _confirm(api, case, attempt_id, filed_at=future).status_code == 422
    early = (datetime.now(UTC) - timedelta(days=30)).isoformat()
    assert _confirm(api, case, attempt_id, filed_at=early).status_code == 422  # before approval


def test_a_request_id_belongs_to_one_case(api: TestClient, world: dict[str, User]) -> None:
    first = _approved(api)
    first_attempt = _start(api, first).json()["attempts"][0]["id"]
    assert _confirm(api, first, first_attempt).status_code == 200

    # A second case on the other violation, taken to READY_TO_FILE.
    log_in(api, "owner@acme.test")
    other = create_case(api, key="other", issues=[{**ISSUE, "violation_index": 0}])
    other = api.get(f"/api/v1/portal/dataqs/cases/{other['id']}").json()
    submit(api, other)
    log_in(api, "analyst@sts.test")
    build(api, assess(api, staff_case(api, other["id"]), "READY_TO_PREPARE").json())
    log_in(api, "owner@acme.test")
    carrier = api.get(f"/api/v1/portal/dataqs/cases/{other['id']}").json()
    assert approve(api, carrier, carrier["packages"][0]).status_code == 200

    log_in(api, "analyst@sts.test")
    second = staff_case(api, other["id"])
    attempt = _start(api, second, key="other-1").json()["attempts"][0]["id"]
    duplicate = _confirm(api, second, attempt)  # the first case's request ID
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "dataqs_duplicate_case"


def test_only_staff_file(api: TestClient, world: dict[str, User]) -> None:
    case = _approved(api)
    log_in(api, "owner@acme.test")
    assert _start(api, case).status_code == 403
