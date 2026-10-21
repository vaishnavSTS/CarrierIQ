"""Shared data and helpers for the DataQs API tests (fixtures are in conftest.py)."""

import json
from datetime import UTC, date, datetime

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Inspection, Organization, OrganizationCarrier, User
from app.models.enums import OrganizationKind, UserRole, UserStatus
from app.services.dataqs_assessment_service import CHECK_KEYS
from app.services.dataqs_case_service import CONSENT_TERMS_VERSION
from app.services.dataqs_package_service import PACKAGE_TERMS_VERSION
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


def make_org(db: Session, name: str, kind: OrganizationKind) -> Organization:
    organization = Organization(name=name, kind=kind)
    db.add(organization)
    db.flush()
    return organization


def make_user(db: Session, organization: Organization, email: str, role: UserRole) -> User:
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


def log_in(api: TestClient, email: str) -> None:
    api.cookies.clear()
    response = api.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text


def build_world(db: Session) -> dict[str, User]:
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
    acme = make_org(db, "Acme", OrganizationKind.CLIENT)
    other = make_org(db, "Other Co", OrganizationKind.CLIENT)
    sts = make_org(db, "STS", OrganizationKind.STS)
    db.add(OrganizationCarrier(organization_id=acme.id, usdot_number=USDOT, verified=True))
    db.flush()
    return {
        "owner": make_user(db, acme, "owner@acme.test", UserRole.CLIENT_ADMIN),
        "viewer": make_user(db, acme, "viewer@acme.test", UserRole.CLIENT_USER),
        "other": make_user(db, other, "owner@other.test", UserRole.CLIENT_ADMIN),
        "staff": make_user(db, sts, "analyst@sts.test", UserRole.STS_ANALYST),
        "staff2": make_user(db, sts, "admin@sts.test", UserRole.STS_ADMIN),
        "broker": make_user(
            db,
            make_org(db, "Brokerage", OrganizationKind.BROKER),
            "b@broker.test",
            UserRole.BROKER_ADMIN,
        ),
    }


ISSUE = {
    "violation_index": 1,
    "reason": "VIOLATION_INCORRECT",
    "recorded_value": "Brakes out of adjustment",
    "requested_value": "Remove the violation",
    "factual_basis": "The brakes were adjusted and inspected the morning of the inspection.",
}


def create_case(api: TestClient, key: str = "intake-1", issues: list[dict] | None = None) -> dict:
    response = api.post(
        f"/api/v1/portal/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": issues or [ISSUE]},
        headers={"Idempotency-Key": key},
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload(
    api: TestClient, case: dict, data: bytes = PDF, name: str = "brake-log.pdf"
) -> httpx.Response:
    links = [{"issue_id": case["issues"][0]["id"], "relevance": "Adjustment record that day"}]
    return api.post(
        f"/api/v1/portal/dataqs/cases/{case['id']}/evidence",
        files={"file": (name, data, "application/pdf")},
        data={"links": json.dumps(links), "document_date": "2024-09-12"},
    )


# --- Phase 3 flow: submit, assess, build, approve ---------------------------------------------

ALL_PASS = {key: {"result": "PASS", "note": None} for key in CHECK_KEYS}
NARRATIVE = (
    "The carrier's shop record shows the brakes were measured and adjusted within limits on the "
    "morning of the inspection. We request removal of violation 396.3A1BOS."
)


def submitted_case(api: TestClient) -> dict:
    """The carrier's owner opens a case, uploads a file and submits it to STS."""
    log_in(api, "owner@acme.test")
    case = create_case(api)
    upload(api, case)
    case = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    return submit(api, case)


def submit(api: TestClient, case: dict) -> dict:
    """The carrier's owner signs the authorization and submits the case to STS."""
    response = api.post(
        f"/api/v1/portal/dataqs/cases/{case['id']}/submit",
        json={
            "expected_version": case["row_version"],
            "signer_name": "Pat Owner",
            "terms_version": CONSENT_TERMS_VERSION,
            "accept": True,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def staff_case(api: TestClient, case_id: int) -> dict:
    return api.get(f"/api/v1/dataqs/cases/{case_id}").json()


def assess(api: TestClient, case: dict, outcome: str, **extra: object) -> httpx.Response:
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/assessments",
        json={
            "expected_version": case["row_version"],
            "outcome": outcome,
            "checks": ALL_PASS,
            **extra,
        },
    )


def build(api: TestClient, case: dict, narrative: str = NARRATIVE) -> httpx.Response:
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/packages",
        json={
            "expected_version": case["row_version"],
            "dataqs_reason": "VIOLATION_INCORRECT",
            "viewed_in": "A&I/SMS Results",
            "narrative": narrative,
            "evidence_ids": [e["id"] for e in case["evidence"]],
            "references": ["49 CFR 396.3(a)(1)"],
        },
    )


def approve(api: TestClient, case: dict, package: dict) -> httpx.Response:
    return api.post(
        f"/api/v1/portal/dataqs/cases/{case['id']}/approvals",
        json={
            "expected_version": case["row_version"],
            "package_id": package["id"],
            "package_hash": package["manifest_hash"],
            "signer_name": "Pat Owner",
            "terms_version": PACKAGE_TERMS_VERSION,
            "accept": True,
        },
    )


def ready_package(api: TestClient) -> tuple[int, dict]:
    """A case assessed as ready, with package v1 built and waiting for the carrier."""
    case_id = submitted_case(api)["id"]
    log_in(api, "analyst@sts.test")
    assessed = assess(api, staff_case(api, case_id), "READY_TO_PREPARE")
    assert assessed.status_code == 200, assessed.text
    built = build(api, assessed.json())
    assert built.status_code == 200, built.text
    return case_id, built.json()


# --- Phase 4 flow: file the approved package -------------------------------------------------

FILING_ACK = "Your request has been submitted. Request #RDR-2026-001234"


def approved_case(api: TestClient) -> dict:
    """A case whose package v1 the carrier approved: READY_TO_FILE, seen by STS staff."""
    case_id, _ = ready_package(api)
    log_in(api, "owner@acme.test")
    case = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert approve(api, case, case["packages"][0]).status_code == 200
    log_in(api, "analyst@sts.test")
    return staff_case(api, case_id)


def start_filing(api: TestClient, case: dict, key: str = "file-1") -> httpx.Response:
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


def confirm_filing(
    api: TestClient, case: dict, attempt_id: int, gov_id: str = "RDR-2026-001234", **extra: object
) -> httpx.Response:
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/submission-attempts/{attempt_id}/confirm",
        json={
            "gov_request_id": gov_id,
            "filed_at": datetime.now(UTC).isoformat(),
            "assigned_agency": "Texas DPS",
            "acknowledgement": FILING_ACK,
            "package_version": 1,
            "portal_status": "Submitted",
            **extra,
        },
    )
