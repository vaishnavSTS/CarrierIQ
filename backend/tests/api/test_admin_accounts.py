"""STS admins add carriers and staff (who choose their own password) and delete accounts."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import get_signup_email_sender
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.main import app
from app.models import CarrierClaim, ComplianceRequest, Organization, OrganizationCarrier, User
from app.models.enums import ComplianceRequestStatus, ComplianceService, UserRole, UserStatus
from tests.api.test_auth import log_in, make_user, register
from tests.api.test_password_reset import NEW_PASSWORD, FakeSender, token_from

STAFF = "/api/v1/admin/staff"


@pytest.fixture
def sender() -> FakeSender:
    return FakeSender()


@pytest.fixture
def api(db: Session, real_auth: None, sender: FakeSender) -> Iterator[TestClient]:
    limiter.reset()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_signup_email_sender] = lambda: sender
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    limiter.reset()


def as_admin(api: TestClient, db: Session) -> User:
    admin = make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)
    log_in(api, "admin@sts.test")
    return admin


def invite(api: TestClient, email: str = "New.Person@STS.test", role: str = "STS_ANALYST"):  # noqa: ANN201
    return api.post(STAFF, json={"email": email, "full_name": " New Person ", "role": role})


# --- Adding a carrier -----------------------------------------------------------------------------

CLIENTS = "/api/v1/admin/clients"
CARRIER = {
    "full_name": " Pat Owner ",
    "company_name": "Client Trucking LLC",
    "email": "Owner@Client.com",
    "phone": "(610) 590-0223",
    "usdot_number": 295017,
}


def test_admin_adds_a_carrier_who_chooses_a_password_and_starts_the_trial(
    api: TestClient, db: Session, sender: FakeSender
) -> None:
    as_admin(api, db)

    answer = api.post(CLIENTS, json=CARRIER)

    assert answer.status_code == 201, answer.text
    body = answer.json()
    assert body["invite_emailed"] is True
    account = body["account"]
    assert (account["full_name"], account["email"], account["phone"]) == (
        "Pat Owner",
        "owner@client.com",
        "6105900223",
    )
    assert (account["role"], account["portal"], account["organization_name"]) == (
        "CLIENT_ADMIN",
        "client",
        "Client Trucking LLC",
    )
    assert account["usdot_numbers"] == [295017]
    assert account["verified_usdot_numbers"] == [295017]  # STS added it: verified
    assert account["claimed_usdot_numbers"] == [295017]
    assert account["is_new"] is False  # no "new sign-up" pop-up for it
    assert sender.sent[0]["to"] == ["owner@client.com"]
    assert "free trial starts when you first sign in" in str(sender.sent[0]["text"])

    user = db.scalar(select(User).where(User.email == "owner@client.com"))
    assert user is not None
    assert user.password_hash is None and user.terms_accepted_at is None
    assert user.email_verified_at is None  # confirmed when they use the link

    # The link sets the password, confirms the email and starts the month from then.
    reset = {"token": token_from(sender), "password": NEW_PASSWORD}
    api.post("/api/v1/auth/logout")
    assert api.post("/api/v1/auth/password/reset", json=reset).status_code == 200
    me = api.post(
        "/api/v1/auth/login", json={"email": "owner@client.com", "password": NEW_PASSWORD}
    )
    assert me.status_code == 200, me.text
    assert me.json()["billing"]["state"] == "trial"
    db.refresh(user)
    assert user.email_verified_at is not None
    assert user.trial_ends_at is not None and user.trial_ends_at > user.email_verified_at


def test_adding_a_carrier_refuses_a_used_email_or_claimed_usdot_and_bad_details(
    api: TestClient, db: Session
) -> None:
    register(api)  # owner@client.com, USDOT 295017
    api.post("/api/v1/auth/logout")
    as_admin(api, db)

    assert api.post(CLIENTS, json=CARRIER).status_code == 409  # email in use
    claimed = api.post(CLIENTS, json={**CARRIER, "email": "other@client.com"})
    assert claimed.status_code == 409
    assert "already in use" in claimed.json()["error"]["message"]
    for bad in ({"phone": "123"}, {"usdot_number": 0}, {"company_name": " "}, {"email": "x"}):
        answer = api.post(CLIENTS, json={**CARRIER, "email": "new@client.com", **bad})
        assert answer.status_code == 422, bad


def test_only_sts_admins_add_carriers(api: TestClient, db: Session) -> None:
    make_user(db, "analyst@sts.test", UserRole.STS_ANALYST, UserStatus.ACTIVE)
    log_in(api, "analyst@sts.test")

    assert api.post(CLIENTS, json=CARRIER).status_code == 403


# --- Adding staff ---------------------------------------------------------------------------------


def test_new_staff_member_chooses_a_password_from_the_email(
    api: TestClient, db: Session, sender: FakeSender
) -> None:
    as_admin(api, db)

    answer = invite(api)

    assert answer.status_code == 201, answer.text
    body = answer.json()
    assert body["invite_emailed"] is True
    account = body["account"]
    assert (account["email"], account["full_name"], account["role"], account["status"]) == (
        "new.person@sts.test",
        "New Person",
        "STS_ANALYST",
        "ACTIVE",
    )
    assert account["portal"] == "internal" and account["is_new"] is False
    assert sender.sent[0]["to"] == ["new.person@sts.test"]
    assert "72 hours" in str(sender.sent[0]["text"])

    # No password yet: nobody can log in as them until they use the link.
    api.post("/api/v1/auth/logout")
    no_password = {"email": "new.person@sts.test", "password": "anything-at-all"}
    assert api.post("/api/v1/auth/login", json=no_password).status_code == 401

    reset = {"token": token_from(sender), "password": NEW_PASSWORD}
    assert api.post("/api/v1/auth/password/reset", json=reset).status_code == 200
    login = {"email": "new.person@sts.test", "password": NEW_PASSWORD}
    me = api.post("/api/v1/auth/login", json=login)
    assert me.status_code == 200  # email already counts as confirmed
    assert me.json()["portal"] == "internal"

    # The link works once.
    again = {"token": reset["token"], "password": "another-new-password"}
    assert api.post("/api/v1/auth/password/reset", json=again).status_code == 422


def test_staff_join_the_existing_sts_company(api: TestClient, db: Session) -> None:
    admin = as_admin(api, db)

    invite(api, role="STS_ADMIN")

    user = db.scalar(select(User).where(User.email == "new.person@sts.test"))
    assert user is not None
    assert user.role == UserRole.STS_ADMIN
    assert user.organization_id == admin.organization_id


def test_without_an_email_service_the_answer_says_so(api: TestClient, db: Session) -> None:
    app.dependency_overrides[get_signup_email_sender] = lambda: None
    as_admin(api, db)

    answer = invite(api)

    assert answer.status_code == 201
    assert answer.json()["invite_emailed"] is False


def test_adding_staff_refuses_a_used_email_and_other_roles(api: TestClient, db: Session) -> None:
    as_admin(api, db)

    assert invite(api, email="ADMIN@sts.test").status_code == 409
    assert invite(api, role="CLIENT_ADMIN").status_code == 422
    bad_email = api.post(STAFF, json={"email": "nope", "full_name": "X", "role": "STS_ADMIN"})
    assert bad_email.status_code == 422
    no_name = api.post(STAFF, json={"email": "a@sts.test", "full_name": "  ", "role": "STS_ADMIN"})
    assert no_name.status_code == 422


def test_only_sts_admins_add_staff_or_delete_accounts(api: TestClient, db: Session) -> None:
    other = make_user(db, "c@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    make_user(db, "analyst@sts.test", UserRole.STS_ANALYST, UserStatus.ACTIVE)
    log_in(api, "analyst@sts.test")

    assert invite(api).status_code == 403
    assert api.delete(f"/api/v1/admin/users/{other.id}").status_code == 403
    assert db.get(User, other.id) is not None


# --- Deleting accounts ----------------------------------------------------------------------------


def test_deleting_a_carriers_only_account_removes_its_company_and_frees_the_usdot(
    api: TestClient, db: Session
) -> None:
    register(api)  # owner@client.com, claims USDOT 295017
    api.post("/api/v1/auth/logout")
    owner = db.scalar(select(User).where(User.email == "owner@client.com"))
    assert owner is not None
    org_id, owner_id = owner.organization_id, owner.id
    as_admin(api, db)

    assert api.delete(f"/api/v1/admin/users/{owner_id}").status_code == 204

    db.expire_all()
    assert db.get(User, owner_id) is None
    assert db.get(Organization, org_id) is None
    assert (
        db.scalars(select(CarrierClaim).where(CarrierClaim.organization_id == org_id)).all() == []
    )
    links = select(OrganizationCarrier).where(OrganizationCarrier.organization_id == org_id)
    assert db.scalars(links).all() == []
    emails = [a["email"] for a in api.get("/api/v1/admin/users").json()]
    assert "owner@client.com" not in emails
    api.post("/api/v1/auth/logout")

    register(api, "new@owner.com")  # USDOT 295017 can be claimed again


def test_a_deleted_account_is_logged_out(api: TestClient, db: Session) -> None:
    user = make_user(db, "c@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    log_in(api, "c@client.test")
    session_cookie = api.cookies.get("carrieriq_session")
    api.post("/api/v1/auth/logout")
    as_admin(api, db)
    api.delete(f"/api/v1/admin/users/{user.id}")
    api.post("/api/v1/auth/logout")

    api.cookies.set("carrieriq_session", session_cookie or "")

    assert api.get("/api/v1/auth/me").status_code == 401


def test_an_account_with_records_is_kept(api: TestClient, db: Session) -> None:
    user = make_user(db, "c@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    db.add(
        ComplianceRequest(
            organization_id=user.organization_id,
            usdot_number=295017,
            service=list(ComplianceService)[0],
            status=list(ComplianceRequestStatus)[0],
            requested_by_id=user.id,
        )
    )
    db.flush()
    as_admin(api, db)

    answer = api.delete(f"/api/v1/admin/users/{user.id}")

    assert answer.status_code == 409
    assert "service requests" in answer.json()["error"]["message"]
    assert "Disable it instead" in answer.json()["error"]["message"]
    assert db.get(User, user.id) is not None


def test_admins_cannot_delete_themselves(api: TestClient, db: Session) -> None:
    admin = as_admin(api, db)

    assert api.delete(f"/api/v1/admin/users/{admin.id}").status_code == 422
    assert api.delete("/api/v1/admin/users/999999").status_code == 404


def test_deleting_a_staff_member_keeps_the_sts_company(api: TestClient, db: Session) -> None:
    admin = as_admin(api, db)
    invite(api)
    staff = db.scalar(select(User).where(User.email == "new.person@sts.test"))
    assert staff is not None

    assert api.delete(f"/api/v1/admin/users/{staff.id}").status_code == 204

    db.expire_all()
    assert db.get(User, staff.id) is None
    assert db.get(Organization, admin.organization_id) is not None


def test_deleting_one_of_a_companys_accounts_keeps_the_company_and_its_claim(
    api: TestClient, db: Session
) -> None:
    register(api)
    api.post("/api/v1/auth/logout")
    owner = db.scalar(select(User).where(User.email == "owner@client.com"))
    assert owner is not None
    colleague = User(
        organization_id=owner.organization_id,
        email="colleague@client.com",
        full_name="Colleague",
        role=UserRole.CLIENT_USER,
        status=UserStatus.ACTIVE,
    )
    db.add(colleague)
    db.flush()
    owner_id, org_id = owner.id, owner.organization_id
    as_admin(api, db)

    assert api.delete(f"/api/v1/admin/users/{owner_id}").status_code == 204

    db.expire_all()
    assert db.get(User, owner_id) is None
    assert db.get(Organization, org_id) is not None
    claim = db.scalar(select(CarrierClaim).where(CarrierClaim.usdot_number == 295017))
    assert claim is not None
    assert (claim.organization_id, claim.claimed_by_id) == (org_id, None)
