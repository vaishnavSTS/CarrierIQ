"""DataQs intake through the API (Phase 2): check an inspection, open a case, upload evidence,
submit it, and who may do each."""

import json
from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import get_db
from app.main import app
from app.models import (
    DataQsAuditEvent,
    DataQsAuthorization,
    DataQsTask,
    Inspection,
    Organization,
    OrganizationCarrier,
    User,
)
from app.models.enums import OrganizationKind, UserRole, UserStatus
from app.services.dataqs_case_service import CONSENT_TERMS_VERSION
from app.services.dataqs_evidence_storage import get_evidence_storage
from tests.factories import make_carrier, make_raw_record

PASSWORD = "correct-horse-battery"
USDOT = 7654321
INSPECTION_ID = "TX1234567890"
PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


class MemoryStorage:
    def __init__(self) -> None:
        self.files: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.files[key] = (data, content_type)

    def get(self, key: str) -> bytes:
        return self.files[key][0]


@pytest.fixture
def storage() -> MemoryStorage:
    return MemoryStorage()


@pytest.fixture
def api(db: Session, real_auth: None, storage: MemoryStorage) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_evidence_storage] = lambda: storage
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _org(db: Session, name: str, kind: OrganizationKind) -> Organization:
    organization = Organization(name=name, kind=kind)
    db.add(organization)
    db.flush()
    return organization


def _user(db: Session, organization: Organization, email: str, role: UserRole) -> User:
    user = User(
        organization_id=organization.id,
        email=email,
        full_name=email.split("@")[0].title(),
        password_hash=hash_password(PASSWORD),
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.flush()
    return user


def _log_in(api: TestClient, email: str) -> None:
    api.cookies.clear()
    response = api.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text


@pytest.fixture
def world(db: Session) -> dict[str, User]:
    """Acme operates USDOT 7654321 (verified by STS), which has one inspection with two
    violations two years ago. Other Co, STS staff and a broker also have accounts."""
    carrier = make_carrier(db, USDOT, "ACME HAULING LLC")
    db.add(
        Inspection(
            source="dot_socrata",
            raw_record_id=make_raw_record(db, INSPECTION_ID).id,
            inspection_id=INSPECTION_ID,
            carrier_id=carrier.id,
            inspection_date=date(2024, 9, 12),
            inspection_level=1,
            state="TX",
            location="Waco",
            vin="1FUJGLDR0CLBP8834",
            vehicle_oos=True,
            violation_data={
                "viol_total": 2,
                "violations": [
                    {
                        "code": "393.9A",
                        "description": "Inoperable required lamp",
                        "applies_to": "VEHICLE",
                        "unit_number": 1,
                        "out_of_service": False,
                    },
                    {
                        "code": "396.3A1BOS",
                        "description": "Brakes out of adjustment",
                        "applies_to": "VEHICLE",
                        "unit_number": 1,
                        "out_of_service": True,
                        "citation_number": "C-555",
                    },
                ],
            },
        )
    )
    acme = _org(db, "Acme", OrganizationKind.CLIENT)
    other = _org(db, "Other Co", OrganizationKind.CLIENT)
    db.add(OrganizationCarrier(organization_id=acme.id, usdot_number=USDOT, verified=True))
    db.flush()
    return {
        "owner": _user(db, acme, "owner@acme.test", UserRole.CLIENT_ADMIN),
        "viewer": _user(db, acme, "viewer@acme.test", UserRole.CLIENT_USER),
        "other": _user(db, other, "owner@other.test", UserRole.CLIENT_ADMIN),
        "staff": _user(
            db, _org(db, "STS", OrganizationKind.STS), "analyst@sts.test", UserRole.STS_ANALYST
        ),
        "broker": _user(
            db,
            _org(db, "Brokerage", OrganizationKind.BROKER),
            "b@broker.test",
            UserRole.BROKER_ADMIN,
        ),
    }


ISSUE = {
    "violation_index": 1,
    "reason": "INACCURATE_VIOLATION",
    "recorded_value": "Brakes out of adjustment",
    "requested_value": "Remove the violation",
    "factual_basis": "The brakes were adjusted and inspected the morning of the inspection.",
}


def _create(api: TestClient, key: str = "intake-1", issues: list[dict] | None = None) -> dict:
    response = api.post(
        f"/api/v1/portal/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": issues or [ISSUE]},
        headers={"Idempotency-Key": key},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _upload(api: TestClient, case: dict, data: bytes = PDF, name: str = "brake-log.pdf"):
    links = [{"issue_id": case["issues"][0]["id"], "relevance": "Adjustment record that day"}]
    return api.post(
        f"/api/v1/portal/dataqs/cases/{case['id']}/evidence",
        files={"file": (name, data, "application/pdf")},
        data={"links": json.dumps(links), "document_date": "2024-09-12"},
    )


def test_owner_checks_the_inspection_before_opening_a_case(
    api: TestClient, world: dict[str, User]
) -> None:
    _log_in(api, "owner@acme.test")
    response = api.get(f"/api/v1/portal/dataqs/carriers/{USDOT}/inspections/{INSPECTION_ID}/check")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["can_open"] is True
    assert body["carrier_name"] == "ACME HAULING LLC"
    assert body["eligibility"]["window_ends"] == "2027-09-12"
    assert [v["code"] for v in body["event"]["violations"]] == ["393.9A", "396.3A1BOS"]
    assert {r["reason"] for r in body["reasons"]} >= {"COURT_OUTCOME", "WRONG_ATTRIBUTION"}

    _log_in(api, "viewer@acme.test")
    viewer = api.get(f"/api/v1/portal/dataqs/carriers/{USDOT}/inspections/{INSPECTION_ID}/check")
    assert viewer.json()["can_open"] is False

    _log_in(api, "owner@other.test")
    other = api.get(f"/api/v1/portal/dataqs/carriers/{USDOT}/inspections/{INSPECTION_ID}/check")
    assert other.status_code == 404


def test_owner_opens_a_draft_case_from_the_preserved_record(
    api: TestClient, world: dict[str, User]
) -> None:
    _log_in(api, "owner@acme.test")
    case = _create(api)

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
    _log_in(api, "owner@acme.test")
    first = _create(api, key="same-key")
    again = _create(api, key="same-key")
    assert again["id"] == first["id"]
    assert len(api.get("/api/v1/portal/dataqs/cases").json()["cases"]) == 1


def test_a_second_case_on_the_same_violation_is_refused(
    api: TestClient, world: dict[str, User]
) -> None:
    _log_in(api, "owner@acme.test")
    first = _create(api, key="a")
    response = api.post(
        f"/api/v1/portal/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": [ISSUE]},
        headers={"Idempotency-Key": "b"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "dataqs_duplicate_case"
    assert f"#{first['id']}" in response.json()["error"]["message"]

    # A different violation on the same inspection is a separate request.
    other_violation = {**ISSUE, "violation_index": 0}
    assert _create(api, key="c", issues=[other_violation])["id"] != first["id"]


def test_viewer_cannot_open_or_change_a_case(api: TestClient, world: dict[str, User]) -> None:
    _log_in(api, "owner@acme.test")
    case = _create(api)

    _log_in(api, "viewer@acme.test")
    assert api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()["can_act"] is False
    response = api.post(
        f"/api/v1/portal/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": [{**ISSUE, "violation_index": 0}]},
    )
    assert response.status_code == 403
    assert _upload(api, case).status_code == 403


def test_other_company_and_brokers_cannot_reach_the_case(
    api: TestClient, world: dict[str, User]
) -> None:
    _log_in(api, "owner@acme.test")
    case = _create(api)

    _log_in(api, "owner@other.test")
    assert api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").status_code == 404
    assert api.get("/api/v1/portal/dataqs/cases").json()["cases"] == []
    assert _upload(api, case).status_code == 404

    _log_in(api, "b@broker.test")
    assert api.get("/api/v1/portal/dataqs/cases").status_code == 403
    assert api.get("/api/v1/dataqs/cases").status_code == 403


def test_evidence_upload_checks_the_file_and_keeps_its_hash(
    api: TestClient, world: dict[str, User], storage: MemoryStorage
) -> None:
    _log_in(api, "owner@acme.test")
    case = _create(api)

    response = _upload(api, case)
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

    fake = _upload(api, case, data=b"MZ\x90\x00 executable", name="invoice.pdf")
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
    _log_in(api, "owner@acme.test")
    case = _create(api)
    _upload(api, case)
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
    _log_in(api, "owner@acme.test")
    case = _create(api)
    evidence_id = _upload(api, case).json()["evidence"][0]["id"]

    _log_in(api, "analyst@sts.test")
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
