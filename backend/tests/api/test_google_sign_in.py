"""Continue with Google: start → Google → callback → logged in, or finish signing up."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import get_google_client
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.core.google_oauth import GoogleIdentity, identity_from_id_token
from app.core.security import create_purpose_token
from app.db.session import get_db
from app.main import app
from app.models import Carrier, User
from app.models.enums import UserRole, UserStatus
from tests.api.test_auth import PASSWORD, make_user

CLIENT_ID = "test-client.apps.googleusercontent.com"
NEW_PERSON = GoogleIdentity(
    sub="g-111", email="new@gmail.com", email_verified=True, name="Ana Ruiz"
)


class FakeGoogle:
    def __init__(self) -> None:
        self.identity = NEW_PERSON

    def authorization_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    def exchange(self, code: str) -> GoogleIdentity:
        return self.identity


@pytest.fixture
def google_on(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(settings, "google_client_secret", "secret")


@pytest.fixture
def fake_google() -> FakeGoogle:
    return FakeGoogle()


@pytest.fixture
def api(
    db: Session, real_auth: None, google_on: None, fake_google: FakeGoogle
) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_google_client] = lambda: fake_google
    with TestClient(app, follow_redirects=False) as client:
        yield client
    app.dependency_overrides.clear()


def round_trip(api: TestClient) -> str:
    """Start, come back from Google with the right state; return where the callback sends us."""
    start = api.get("/api/v1/auth/google/start")
    assert start.status_code == 302
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    back = api.get("/api/v1/auth/google/callback", params={"code": "c", "state": state})
    assert back.status_code == 302
    return back.headers["location"]


# --- ID token checks (no database) ---------------------------------------------------------------


def id_token(**changes: object) -> str:
    claims: dict[str, object] = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "exp": int((datetime.now(UTC) + timedelta(minutes=5)).timestamp()),
        "sub": "g-1",
        "email": "Pat@Example.com",
        "email_verified": True,
        "name": "Pat",
    }
    return jwt.encode({**claims, **changes}, "any-key-is-fine-here-signature-unchecked", "HS256")


def test_id_token_gives_identity() -> None:
    assert identity_from_id_token(id_token(), CLIENT_ID) == GoogleIdentity(
        sub="g-1", email="pat@example.com", email_verified=True, name="Pat"
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"aud": "someone-elses-app"},
        {"iss": "https://evil.example"},
        {"exp": int((datetime.now(UTC) - timedelta(minutes=5)).timestamp())},
        {"sub": ""},
    ],
)
def test_id_token_rejected(changes: dict[str, object]) -> None:
    with pytest.raises(UnauthorizedError):
        identity_from_id_token(id_token(**changes), CLIENT_ID)


def test_options_and_start_are_off_without_google_settings(
    real_auth: None, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "google_client_id", None)
    assert client.get("/api/v1/auth/options").json()["google"] is False
    assert client.get("/api/v1/auth/google/start", follow_redirects=False).status_code == 404


# --- Flows (database) ----------------------------------------------------------------------------


def test_new_google_user_finishes_sign_up_and_is_logged_in(api: TestClient, db: Session) -> None:
    db.add(Carrier(usdot_number=297569, legal_name="VANEK BROTHERS TRUCKING COMPANY"))
    db.flush()
    assert api.get("/api/v1/auth/options").json()["google"] is True

    assert round_trip(api) == "/register/google"
    assert api.get("/api/v1/auth/me").status_code == 401  # not logged in yet
    assert api.get("/api/v1/auth/google/signup").json() == {
        "email": "new@gmail.com",
        "full_name": "Ana Ruiz",
        "portal": "client",  # started from the client sign-up page
    }

    details = {
        "company_name": "Vanek Brothers Trucking Co.",
        "phone": "(610) 590-0223",
        "usdot_number": 297569,
    }
    for required in details:  # company, mobile and USDOT are all required
        partial = {k: v for k, v in details.items() if k != required}
        assert api.post("/api/v1/auth/google/signup", json=partial).status_code == 422, required
    done = api.post("/api/v1/auth/google/signup", json=details)
    assert done.status_code == 201, done.text
    assert (done.json()["status"], done.json()["portal"]) == ("ACTIVE", "client")
    assert api.get("/api/v1/auth/me").json()["email"] == "new@gmail.com"  # logged in

    user = db.query(User).filter_by(email="new@gmail.com").one()
    assert (user.status, user.google_sub, user.password_hash, user.phone) == (
        UserStatus.ACTIVE,
        "g-111",
        None,
        "6105900223",
    )
    from app.repositories.user_repository import UserRepository

    org = UserRepository(db).organization(user.organization_id)
    assert org is not None and org.name == "Vanek Brothers Trucking Co."  # as they typed it

    # The sign-up step is used up; next time Google goes straight to the portal.
    assert api.get("/api/v1/auth/google/signup").status_code == 401
    api.post("/api/v1/auth/logout")
    assert round_trip(api) == "/portal"


def test_existing_account_signs_in_with_google_and_is_linked(
    api: TestClient, db: Session, fake_google: FakeGoogle
) -> None:
    user = make_user(db, "pat@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    fake_google.identity = GoogleIdentity("g-222", "pat@client.test", True, "Pat")

    assert round_trip(api) == "/portal"
    assert api.get("/api/v1/auth/me").json()["email"] == "pat@client.test"
    db.refresh(user)
    assert user.google_sub == "g-222"


def test_staff_land_on_the_dashboard(api: TestClient, db: Session, fake_google: FakeGoogle) -> None:
    make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)
    fake_google.identity = GoogleIdentity("g-333", "admin@sts.test", True, "Admin")

    assert round_trip(api) == "/dashboard"


def test_disabled_and_unverified_accounts_are_refused(
    api: TestClient, db: Session, fake_google: FakeGoogle
) -> None:
    make_user(db, "gone@client.test", UserRole.CLIENT_ADMIN, UserStatus.DISABLED)
    fake_google.identity = GoogleIdentity("g-4", "gone@client.test", True, "Gone")
    assert round_trip(api) == "/login?google=disabled"

    fake_google.identity = GoogleIdentity("g-5", "who@example.com", False, "Who")
    assert round_trip(api) == "/login?google=failed"


def test_callback_rejects_a_wrong_state(api: TestClient) -> None:
    api.get("/api/v1/auth/google/start")
    back = api.get("/api/v1/auth/google/callback", params={"code": "c", "state": "forged"})
    assert back.headers["location"] == "/login?google=failed"


def test_sign_up_token_is_never_a_session(api: TestClient) -> None:
    token = create_purpose_token(
        {"google_sub": "1", "email": "a@b.co", "name": "A", "sub": "1"}, "google_signup", 5
    )
    api.cookies.set(get_settings().auth_cookie_name, token)
    assert api.get("/api/v1/auth/me").status_code == 401


def test_google_only_account_cannot_use_a_password(api: TestClient, db: Session) -> None:
    user = make_user(db, "g@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    user.password_hash = None
    db.flush()

    response = api.post("/api/v1/auth/login", json={"email": "g@client.test", "password": PASSWORD})
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("given", "fmcsa"),
    [
        ("Vanek Brothers Trucking Co.", "VANEK BROTHERS TRUCKING COMPANY"),
        ("C&B Transportation, Inc", "C AND B TRANSPORTATION INC"),
        ("the united moving & storage llc", "UNITED MOVING AND STORAGE"),
    ],
)
def test_company_names_compare_without_case_punctuation_or_endings(given: str, fmcsa: str) -> None:
    from app.services.auth_service import company_key

    assert company_key(given) == company_key(fmcsa)
    assert company_key("Vanek Trucking") != company_key("VANEK BROTHERS TRUCKING COMPANY")
