"""STS staff open DataQs drafts for any carrier: for the client company STS verified the carrier
for (its owner signs and submits), or held by STS until the carrier has one."""

from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import DataQsAuditEvent, DataQsMessage, OrganizationCarrier, User
from app.models.enums import OrganizationKind
from tests.dataqs.helpers import INSPECTION_ID, ISSUE, USDOT, log_in, make_org

CHECK = f"/api/v1/dataqs/carriers/{USDOT}/inspections/{INSPECTION_ID}/check"


def staff_create(api: TestClient, key: str = "staff-1") -> dict:
    response = api.post(
        f"/api/v1/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": [ISSUE]},
        headers={"Idempotency-Key": key},
    )
    assert response.status_code == 201, response.text
    return response.json()


def unlink_carrier(db: Session) -> None:
    db.execute(delete(OrganizationCarrier).where(OrganizationCarrier.usdot_number == USDOT))
    db.flush()


def test_staff_open_a_draft_for_the_carriers_client_company(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    log_in(api, "analyst@sts.test")
    check = api.get(CHECK).json()
    assert check["can_open"] is True
    assert (check["opens_for"], check["held_by_sts"]) == ("Acme", False)

    case = staff_create(api)
    assert case["organization_name"] == "Acme"
    assert case["held_by_sts"] is False
    assert (case["work_status"], case["action_owner"]) == ("DRAFT", "CARRIER")
    created = db.scalar(
        select(DataQsAuditEvent).where(
            DataQsAuditEvent.case_id == case["id"], DataQsAuditEvent.action == "case.created"
        )
    )
    assert created is not None and created.after["opened_by_sts"] is True

    # The owner is told, sees the draft and signs and submits it as usual.
    message = db.scalar(select(DataQsMessage).where(DataQsMessage.case_id == case["id"]))
    assert message is not None and message.kind == "CASE_OPENED_BY_STS"
    log_in(api, "owner@acme.test")
    mine = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    assert mine["can_submit"] is True


def test_staff_hold_a_draft_until_the_carrier_has_a_client_company(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    unlink_carrier(db)
    log_in(api, "analyst@sts.test")
    check = api.get(CHECK).json()
    assert (check["can_open"], check["opens_for"], check["held_by_sts"]) == (True, None, True)

    case = staff_create(api)
    assert case["held_by_sts"] is True
    assert db.scalar(select(DataQsMessage).where(DataQsMessage.case_id == case["id"])) is None

    # No client can see it yet.
    log_in(api, "owner@acme.test")
    assert api.get("/api/v1/portal/dataqs/cases").json()["cases"] == []

    # An STS admin verifies the carrier for Acme: the draft moves to Acme and its owner is told.
    log_in(api, "admin@sts.test")
    added = api.post(
        f"/api/v1/admin/users/{world['owner'].id}/carriers", json={"usdot_number": USDOT}
    )
    assert added.status_code == 200, added.text
    moved = api.get(f"/api/v1/dataqs/cases/{case['id']}").json()
    assert (moved["organization_name"], moved["held_by_sts"]) == ("Acme", False)
    handed = db.scalar(
        select(DataQsAuditEvent).where(
            DataQsAuditEvent.case_id == case["id"],
            DataQsAuditEvent.action == "case.handed_to_carrier",
        )
    )
    assert handed is not None
    message = db.scalar(select(DataQsMessage).where(DataQsMessage.case_id == case["id"]))
    assert message is not None and message.kind == "CASE_OPENED_BY_STS"

    log_in(api, "owner@acme.test")
    assert [c["id"] for c in api.get("/api/v1/portal/dataqs/cases").json()["cases"]] == [case["id"]]


def test_a_carrier_verified_for_two_companies_is_refused(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    second = make_org(db, "Second Co", OrganizationKind.CLIENT)
    db.add(OrganizationCarrier(organization_id=second.id, usdot_number=USDOT, verified=True))
    db.flush()
    log_in(api, "analyst@sts.test")
    check = api.get(CHECK).json()
    assert check["can_open"] is False
    assert "more than one client company" in check["cannot_open_reason"]
    response = api.post(
        f"/api/v1/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": [ISSUE]},
    )
    assert response.status_code == 422


def test_clients_cannot_use_the_staff_route(api: TestClient, world: dict[str, User]) -> None:
    log_in(api, "owner@acme.test")
    response = api.post(
        f"/api/v1/dataqs/carriers/{USDOT}/cases",
        json={"inspection_id": INSPECTION_ID, "issues": [ISSUE]},
    )
    assert response.status_code == 403
