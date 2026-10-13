"""Login, registration, approval and who may reach which portal."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import (
    create_session_token,
    hash_password,
    read_session_token,
    verify_password,
)
from app.db.session import get_db
from app.main import app
from app.models import Carrier, Organization, User
from app.models.enums import OrganizationKind, UserRole, UserStatus

PASSWORD = "correct-horse-battery"


# --- Pure functions (no database) ----------------------------------------------------------------


def test_password_hash_round_trip() -> None:
    stored = hash_password(PASSWORD)

    assert stored.startswith("scrypt$")
    assert PASSWORD not in stored
    assert verify_password(PASSWORD, stored)
    assert not verify_password("wrong-password", stored)
    assert hash_password(PASSWORD) != stored  # a new salt every time


def test_verify_password_rejects_malformed_hash() -> None:
    assert not verify_password(PASSWORD, "not-a-hash")
    assert not verify_password(PASSWORD, "bcrypt$1$2$3$a$b")


def test_session_token_round_trip_and_expiry() -> None:
    assert read_session_token(create_session_token(42)) == 42

    expired = create_session_token(42, now=datetime.now(UTC) - timedelta(days=2))
    assert read_session_token(expired) is None
    assert read_session_token("garbage") is None


def test_protected_routes_need_login(real_auth: None, client: TestClient) -> None:
    for path in ("/api/v1/auth/me", "/api/v1/dashboard", "/api/v1/portal/overview"):
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.json()["error"]["code"] == "not_authenticated"


def test_health_stays_public(real_auth: None, client: TestClient) -> None:
    assert client.get("/api/v1/health").status_code in (200, 503)


# --- Flows (database) ----------------------------------------------------------------------------


@pytest.fixture
def api(db: Session, real_auth: None) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_user(db: Session, email: str, role: UserRole, status: UserStatus) -> User:
    kind = OrganizationKind.STS if role.is_staff else OrganizationKind.CLIENT
    organization = Organization(name=f"Org of {email}", kind=kind)
    db.add(organization)
    db.flush()
    user = User(
        organization_id=organization.id,
        email=email,
        full_name="Someone",
        password_hash=hash_password(PASSWORD),
        role=role,
        status=status,
    )
    db.add(user)
    db.flush()
    return user


def log_in(api: TestClient, email: str) -> dict[str, object]:
    response = api.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    body: dict[str, object] = response.json()
    return body


def sign_up(email: str = "Owner@Client.com", **changes: object) -> dict[str, object]:
    body: dict[str, object] = {
        "full_name": "Pat Owner",
        "company_name": "Client Trucking LLC",
        "email": email,
        "phone": "(610) 590-0223",
        "password": PASSWORD,
        "usdot_number": 295017,
    }
    return {**body, **changes}


def register(api: TestClient, email: str = "Owner@Client.com") -> None:
    response = api.post("/api/v1/auth/register", json=sign_up(email))
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "PENDING"


def test_client_registers_waits_for_approval_then_sees_portal(api: TestClient, db: Session) -> None:
    db.add(Carrier(usdot_number=295017, legal_name="CLIENT TRUCKING LLC"))
    make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)
    register(api)

    pending = api.post(
        "/api/v1/auth/login", json={"email": "owner@client.com", "password": PASSWORD}
    )
    assert pending.status_code == 403
    assert pending.json()["error"]["code"] == "account_pending"

    log_in(api, "admin@sts.test")
    waiting = api.get("/api/v1/admin/users", params={"status": "PENDING"}).json()
    assert [(u["email"], u["usdot_numbers"]) for u in waiting] == [("owner@client.com", [295017])]
    approved = api.post(f"/api/v1/admin/users/{waiting[0]['id']}/approve")
    assert approved.json()["status"] == "ACTIVE"
    api.post("/api/v1/auth/logout")

    me = log_in(api, "OWNER@client.com")  # email case does not matter
    assert (me["role"], me["portal"]) == ("CLIENT_ADMIN", "client")
    overview = api.get("/api/v1/portal/overview").json()
    assert overview["organization_name"] == "Client Trucking LLC"
    assert [(c["usdot_number"], c["legal_name"]) for c in overview["carriers"]] == [
        (295017, "CLIENT TRUCKING LLC")
    ]


def test_unapproved_usdot_is_not_shown(api: TestClient, db: Session) -> None:
    client_user = make_user(db, "c@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    from app.models import OrganizationCarrier

    db.add(OrganizationCarrier(organization_id=client_user.organization_id, usdot_number=1))
    db.flush()

    log_in(api, "c@client.test")
    assert api.get("/api/v1/portal/overview").json()["carriers"] == []


def test_register_rejects_duplicate_email_and_short_password(api: TestClient) -> None:
    register(api)
    duplicate = api.post("/api/v1/auth/register", json=sign_up("owner@client.com"))
    assert duplicate.status_code == 409

    short = api.post("/api/v1/auth/register", json=sign_up("x@y.com", password="short"))
    assert short.status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"usdot_number": None},
        {"phone": ""},
        {"phone": "555-0100"},  # 7 digits
        {"phone": "+44 20 7946 0958"},  # not US / Canada
        {"full_name": "  "},
    ],
)
def test_register_requires_usdot_phone_and_name(
    api: TestClient, changes: dict[str, object]
) -> None:
    response = api.post("/api/v1/auth/register", json=sign_up("x@y.com", **changes))
    assert response.status_code == 422, changes


def test_admin_sees_phone_and_whether_it_matches_fmcsa(api: TestClient, db: Session) -> None:
    from datetime import date

    from app.models import Phone
    from app.models.enums import PhoneType
    from tests.factories import make_raw_record

    carrier = Carrier(usdot_number=295017, legal_name="CLIENT TRUCKING LLC", email="ops@ct.com")
    db.add(carrier)
    db.flush()
    db.add(
        Phone(
            carrier_id=carrier.id,
            phone_type=PhoneType.OFFICE,
            number_normalized="6105900223",
            first_seen=date(2026, 1, 1),
            last_seen=date(2026, 10, 1),
            source="dot_socrata",
            raw_record_id=make_raw_record(db).id,
        )
    )
    make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)
    register(api, "someone@else.com")  # phone +1 (610) 590-0223 matches, email does not
    api.post("/api/v1/auth/register", json=sign_up("b@b.com", usdot_number=999, phone="2125550100"))

    log_in(api, "admin@sts.test")
    by_email = {u["email"]: u for u in api.get("/api/v1/admin/users").json()}

    matched = by_email["someone@else.com"]
    assert matched["phone"] == "6105900223"
    assert matched["carrier_checks"] == [
        {
            "usdot_number": 295017,
            "legal_name": "CLIENT TRUCKING LLC",
            "phone_matches_fmcsa": True,
            "email_matches_fmcsa": False,
            "company_matches_fmcsa": True,  # "Client Trucking LLC"
        }
    ]
    # Carrier not loaded yet: no answer either way.
    unknown = by_email["b@b.com"]["carrier_checks"][0]
    assert (unknown["legal_name"], unknown["phone_matches_fmcsa"]) == (None, None)


def test_wrong_password_and_unknown_email_look_the_same(api: TestClient, db: Session) -> None:
    make_user(db, "staff@sts.test", UserRole.STS_ANALYST, UserStatus.ACTIVE)

    wrong = api.post("/api/v1/auth/login", json={"email": "staff@sts.test", "password": "nope"})
    unknown = api.post("/api/v1/auth/login", json={"email": "who@sts.test", "password": "nope"})

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_client_cannot_reach_internal_portal(api: TestClient, db: Session) -> None:
    make_user(db, "c@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    log_in(api, "c@client.test")

    for path in (
        "/api/v1/dashboard",
        "/api/v1/jobs",
        "/api/v1/carriers/search?q=1",
        "/api/v1/admin/users",
    ):
        assert api.get(path).status_code == 403, path


def test_staff_reach_internal_portal_but_not_client_portal(api: TestClient, db: Session) -> None:
    make_user(db, "analyst@sts.test", UserRole.STS_ANALYST, UserStatus.ACTIVE)
    me = log_in(api, "analyst@sts.test")

    assert me["portal"] == "internal"
    assert api.get("/api/v1/jobs").status_code == 200
    assert api.get("/api/v1/portal/overview").status_code == 403
    assert api.get("/api/v1/admin/users").status_code == 403  # analysts don't approve accounts


def test_disabled_account_loses_access_on_next_request(api: TestClient, db: Session) -> None:
    user = make_user(db, "c@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    log_in(api, "c@client.test")
    assert api.get("/api/v1/auth/me").status_code == 200

    user.status = UserStatus.DISABLED
    db.flush()

    assert api.get("/api/v1/auth/me").status_code == 401
    blocked = api.post("/api/v1/auth/login", json={"email": "c@client.test", "password": PASSWORD})
    assert blocked.json()["error"]["code"] == "account_disabled"


def test_session_cookie_is_http_only(api: TestClient, db: Session) -> None:
    make_user(db, "c@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    response = api.post("/api/v1/auth/login", json={"email": "c@client.test", "password": PASSWORD})

    cookie = response.headers["set-cookie"].lower()
    assert "carrieriq_session=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
