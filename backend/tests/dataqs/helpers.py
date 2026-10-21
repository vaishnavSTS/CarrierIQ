"""Shared data and helpers for the DataQs API tests (fixtures are in conftest.py)."""

import json
from datetime import date

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Inspection, Organization, OrganizationCarrier, User
from app.models.enums import OrganizationKind, UserRole, UserStatus
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
    "reason": "INACCURATE_VIOLATION",
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
