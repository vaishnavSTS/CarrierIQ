"""DataQs intake through the API (Phase 2): check an inspection, open a case, upload evidence,
submit it, and who may do each."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsAuditEvent, DataQsAuthorization, DataQsTask, User
from app.services.dataqs_case_service import CONSENT_TERMS_VERSION
from tests.dataqs.helpers import (
    INSPECTION_ID,
    ISSUE,
    PDF,
    USDOT,
    MemoryStorage,
    create_case,
    log_in,
    upload,
)


def test_owner_checks_the_inspection_before_opening_a_case(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "owner@acme.test")
    response = api.get(f"/api/v1/portal/dataqs/carriers/{USDOT}/inspections/{INSPECTION_ID}/check")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["can_open"] is True
    assert body["carrier_name"] == "ACME HAULING LLC"
    assert body["eligibility"]["window_ends"] == "2027-09-12"
    assert [v["code"] for v in body["event"]["violations"]] == ["393.9A", "396.3A1BOS"]
    assert {r["reason"] for r in body["reasons"]} >= {"CITATION_OUTCOME", "WRONG_CARRIER"}
    wrong_carrier = next(r for r in body["reasons"] if r["reason"] == "WRONG_CARRIER")
    assert wrong_carrier["dataqs_label"] == (
        "Company and/or USDOT Number is listed incorrectly on the inspection report"
    )  # exactly as DataQs words it

    log_in(api, "viewer@acme.test")
    viewer = api.get(f"/api/v1/portal/dataqs/carriers/{USDOT}/inspections/{INSPECTION_ID}/check")
    assert viewer.json()["can_open"] is False

    log_in(api, "owner@other.test")
    other = api.get(f"/api/v1/portal/dataqs/carriers/{USDOT}/inspections/{INSPECTION_ID}/check")
    assert other.status_code == 404


def test_owner_opens_a_draft_case_from_the_preserved_record(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "owner@acme.test")
    case = create_case(api)

    assert case["work_status"] == "DRAFT"
    assert case["action_owner"] == "CARRIER"
    assert case["event"]["inspection_id"] == INSPECTION_ID
    [issue] = case["issues"]
    assert (issue["violation_code"], issue["violation_unit"]) == ("396.3A1BOS", "1")
    assert issue["citation_number"] == "C-555"
    assert issue["checklist"]  # suggested evidence for the reason
    assert "Authorization for STS to act on this case" in case["missing_items"]
    assert case["can_upload"] and case["can_submit"]
    assert case["audit"] is None  # the audit trail is for STS staff


def test_repeating_a_create_with_the_same_key_returns_the_first_case(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "owner@acme.test")
    first = create_case(api, key="same-key")
    again = create_case(api, key="same-key")
    assert again["id"] == first["id"]
    assert len(api.get("/api/v1/portal/dataqs/cases").json()["cases"]) == 1


def test_a_second_case_on_the_same_violation_is_refused(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "owner@acme.test")
    first = create_case(api, key="a")
    response = api.post(
        f"/api/v1/portal/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": [ISSUE]},
        headers={"Idempotency-Key": "b"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "dataqs_duplicate_case"
    assert f"case {first['id']}" in response.json()["error"]["message"]

    # A different violation on the same inspection is a separate request.
    other_violation = {**ISSUE, "violation_index": 0}
    assert create_case(api, key="c", issues=[other_violation])["id"] != first["id"]


def test_viewer_cannot_open_or_change_a_case(api: TestClient, world: dict[str, User]) -> None:
    log_in(api, "owner@acme.test")
    case = create_case(api)

    log_in(api, "viewer@acme.test")
    assert api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()["can_act"] is False
    response = api.post(
        f"/api/v1/portal/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": [{**ISSUE, "violation_index": 0}]},
    )
    assert response.status_code == 403
    assert upload(api, case).status_code == 403


def test_other_company_and_brokers_cannot_reach_the_case(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "owner@acme.test")
    case = create_case(api)

    log_in(api, "owner@other.test")
    assert api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").status_code == 404
    assert api.get("/api/v1/portal/dataqs/cases").json()["cases"] == []
    assert upload(api, case).status_code == 404

    log_in(api, "b@broker.test")
    assert api.get("/api/v1/portal/dataqs/cases").status_code == 403
    assert api.get("/api/v1/dataqs/cases").status_code == 403


def test_evidence_upload_checks_the_file_and_keeps_its_hash(
    api: TestClient, world: dict[str, User], storage: MemoryStorage
) -> None:
    log_in(api, "owner@acme.test")
    case = create_case(api)

    response = upload(api, case)
    assert response.status_code == 201, response.text
    [evidence] = response.json()["evidence"]
    assert evidence["mime_type"] == "application/pdf"
    assert evidence["scan_status"] == "PENDING"
    assert len(evidence["sha256"]) == 64
    assert evidence["links"][0]["issue_id"] == case["issues"][0]["id"]
    assert response.json()["issues"][0]["evidence_count"] == 1
    [key] = storage.files
    assert key.startswith(f"org-{case['organization_id']}/case-{case['id']}/")
    assert "brake-log" not in key  # the stored name never carries the file name

    fake = upload(api, case, data=b"MZ\x90\x00 executable", name="invoice.pdf")
    assert fake.status_code == 422
    assert fake.json()["error"]["code"] == "dataqs_evidence_rejected"

    download = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}/evidence/{evidence['id']}")
    assert download.status_code == 200
    assert download.content == PDF
    assert download.headers["content-disposition"].startswith("attachment;")
    assert download.headers["x-content-type-options"] == "nosniff"


def test_submit_signs_the_authorization_and_hands_the_case_to_sts(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    log_in(api, "owner@acme.test")
    case = create_case(api)
    upload(api, case)
    current = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    submit = {
        "expected_version": current["row_version"],
        "signer_name": "Pat Owner",
        "signer_title": "Owner",
        "terms_version": CONSENT_TERMS_VERSION,
        "accept": True,
    }

    stale = api.post(
        f"/api/v1/portal/dataqs/cases/{case['id']}/submit",
        json={**submit, "expected_version": current["row_version"] - 1},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "dataqs_stale_version"
    old_terms = api.post(
        f"/api/v1/portal/dataqs/cases/{case['id']}/submit", json={**submit, "terms_version": "v0"}
    )
    assert old_terms.status_code == 409

    response = api.post(f"/api/v1/portal/dataqs/cases/{case['id']}/submit", json=submit)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["work_status"], body["action_owner"]) == ("STAFF_REVIEW", "STS")
    assert body["can_submit"] is False
    assert body["authorizations"][0]["signer_name"] == "Pat Owner"
    assert body["missing_items"] == []

    tasks = db.scalars(select(DataQsTask).where(DataQsTask.case_id == case["id"])).all()
    assert [t.kind for t in tasks] == ["ASSESS_CASE"]
    [consent] = db.scalars(
        select(DataQsAuthorization).where(DataQsAuthorization.case_id == case["id"])
    ).all()
    assert consent.authority_check["carrier_verified_by_sts"] is True

    again = api.post(f"/api/v1/portal/dataqs/cases/{case['id']}/submit", json=submit)
    assert again.status_code == 200  # a repeated click changes nothing
    assert len(api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()["authorizations"]) == 1


def test_staff_see_every_case_with_its_audit_trail(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    log_in(api, "owner@acme.test")
    case = create_case(api)
    evidence_id = upload(api, case).json()["evidence"][0]["id"]

    log_in(api, "analyst@sts.test")
    [listed] = api.get("/api/v1/dataqs/cases").json()["cases"]
    assert (listed["id"], listed["organization_name"]) == (case["id"], "Acme")
    detail = api.get(f"/api/v1/dataqs/cases/{case['id']}").json()
    assert detail["can_submit"] is False  # only the carrier's owner signs and submits
    assert detail["can_upload"] is True

    assert api.get(f"/api/v1/dataqs/cases/{case['id']}/evidence/{evidence_id}").status_code == 200
    actions = db.scalars(
        select(DataQsAuditEvent.action)
        .where(DataQsAuditEvent.case_id == case["id"])
        .order_by(DataQsAuditEvent.id)
    ).all()
    assert actions == ["case.created", "evidence.uploaded", "evidence.downloaded"]
    assert [a["action"] for a in api.get(f"/api/v1/dataqs/cases/{case['id']}").json()["audit"]][
        -1
    ] == "evidence.downloaded"
