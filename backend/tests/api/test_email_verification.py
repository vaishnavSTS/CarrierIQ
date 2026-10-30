"""Email verification before the free trial, and the honeypot field."""

import re
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import get_google_client, get_signup_email_sender
from app.core.config import get_settings
from app.core.google_oauth import GoogleIdentity
from app.core.rate_limit import limiter
from app.core.security import create_purpose_token, read_session_token
from app.db.session import get_db
from app.main import app
from app.models import User
from tests.api.test_auth import PASSWORD, sign_up

EMAIL = "owner@client.com"
VERIFY = "/api/v1/auth/email/verify"
RESEND = "/api/v1/auth/email/resend"
LOGIN = "/api/v1/auth/login"


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[dict[str, object]] = []

    def send(self, **email: object) -> str:
        self.sent.append(email)
        return "id"


@pytest.fixture
def sender() -> FakeSender:
    return FakeSender()


@pytest.fixture
def api(
    db: Session, real_auth: None, sender: FakeSender, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    limiter.reset()
    monkeypatch.setattr(get_settings(), "email_verification_required", True)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_signup_email_sender] = lambda: sender
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    limiter.reset()


def token_from(sender: FakeSender) -> str:
    match = re.search(r"#token=(\S+)", str(sender.sent[-1]["text"]))
    assert match
    return match.group(1)


def stored(db: Session) -> User:
    return db.scalars(select(User).where(User.email == EMAIL)).one()


def log_in(api: TestClient, password: str = PASSWORD) -> int:
    return api.post(LOGIN, json={"email": EMAIL, "password": password}).status_code


def signed_up(api: TestClient) -> None:
    answer = api.post("/api/v1/auth/register", json=sign_up(EMAIL))
    assert answer.status_code == 201, answer.text
    assert answer.json()["email_verified"] is False


def test_sign_up_waits_for_the_email(api: TestClient, sender: FakeSender) -> None:
    signed_up(api)

    assert get_settings().auth_cookie_name not in api.cookies  # not logged in
    assert api.get("/api/v1/auth/me").status_code == 401
    assert [e["subject"] for e in sender.sent] == ["Confirm your email for CarrierSafetyScan"]
    assert sender.sent[0]["to"] == [EMAIL]

    refused = api.post(LOGIN, json={"email": EMAIL, "password": PASSWORD})
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "email_not_verified"


def test_a_wrong_password_does_not_reveal_an_unconfirmed_account(api: TestClient) -> None:
    signed_up(api)
    assert log_in(api, "wrong-password-here") == 401


def test_the_link_logs_in_starts_the_trial_and_welcomes(
    api: TestClient, db: Session, sender: FakeSender
) -> None:
    signed_up(api)
    user = stored(db)
    user.trial_ends_at = datetime.now(UTC) + timedelta(days=1)  # as if they waited weeks
    db.flush()

    answer = api.post(VERIFY, json={"token": token_from(sender)})

    assert answer.status_code == 200
    assert answer.json()["portal"] == "client"
    assert api.get("/api/v1/auth/me").status_code == 200
    assert user.email_verified_at is not None
    assert user.trial_ends_at > datetime.now(UTC) + timedelta(days=29)
    assert sender.sent[-1]["subject"] == "Welcome to CarrierSafetyScan"


def test_a_used_link_never_logs_in_again(api: TestClient, sender: FakeSender) -> None:
    signed_up(api)
    token = token_from(sender)
    assert api.post(VERIFY, json={"token": token}).status_code == 200
    api.cookies.clear()

    again = api.post(VERIFY, json={"token": token})

    assert again.status_code == 200
    assert again.json() is None
    assert api.get("/api/v1/auth/me").status_code == 401
    assert log_in(api) == 200


def test_bad_links_are_refused(api: TestClient, db: Session) -> None:
    signed_up(api)
    user = stored(db)
    expired = create_purpose_token({"sub": str(user.id)}, "email_verify", -1)
    wrong_kind = create_purpose_token({"sub": str(user.id)}, "password_reset", 30)

    for token in (expired, wrong_kind, "garbage"):
        assert api.post(VERIFY, json={"token": token}).status_code == 422, token
    assert user.email_verified_at is None


def test_the_link_is_never_a_session(api: TestClient, sender: FakeSender) -> None:
    signed_up(api)
    assert read_session_token(token_from(sender)) is None


def test_resend_only_emails_unconfirmed_accounts_and_looks_the_same(
    api: TestClient, sender: FakeSender
) -> None:
    signed_up(api)
    before = len(sender.sent)

    resent = api.post(RESEND, json={"email": EMAIL})
    unknown = api.post(RESEND, json={"email": "nobody@client.com"})
    assert (resent.status_code, resent.json()) == (unknown.status_code, unknown.json())
    assert len(sender.sent) == before + 1

    api.post(VERIFY, json={"token": token_from(sender)})
    count = len(sender.sent)
    assert api.post(RESEND, json={"email": EMAIL}).status_code == 200
    assert len(sender.sent) == count  # already confirmed


def test_resend_cannot_flood_an_inbox(
    api: TestClient, sender: FakeSender, monkeypatch: pytest.MonkeyPatch
) -> None:
    signed_up(api)
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    before = len(sender.sent)

    for n in range(6):
        headers = {"X-Forwarded-For": f"203.0.113.{n}"}
        assert api.post(RESEND, json={"email": EMAIL}, headers=headers).status_code == 200

    assert len(sender.sent) == before + 3


def test_a_password_reset_proves_the_email(
    api: TestClient, db: Session, sender: FakeSender
) -> None:
    signed_up(api)
    api.post("/api/v1/auth/password/forgot", json={"email": EMAIL})
    answer = api.post(
        "/api/v1/auth/password/reset",
        json={"token": token_from(sender), "password": "a-brand-new-password"},
    )
    assert answer.status_code == 200
    assert stored(db).email_verified_at is not None
    assert log_in(api, "a-brand-new-password") == 200


def test_google_confirms_the_email_and_drops_a_strangers_password(
    api: TestClient, db: Session
) -> None:
    """Someone signed up with this address and never confirmed it; the real owner arrives through
    Google. The stranger's password must not keep working."""
    signed_up(api)
    user = stored(db)

    class Google:
        def authorization_url(self, state: str) -> str:
            return f"/fake?state={state}"

        def exchange(self, code: str) -> GoogleIdentity:
            return GoogleIdentity(sub="g-1", email=EMAIL, email_verified=True, name="Owner")

    app.dependency_overrides[get_google_client] = lambda: Google()
    api.cookies.set("carrieriq_google_state", "s")
    answer = api.get("/api/v1/auth/google/callback?code=c&state=s", follow_redirects=False)

    assert answer.headers["location"] == "/portal"
    assert user.email_verified_at is not None
    assert user.password_hash is None
    api.cookies.clear()
    assert log_in(api) == 401


def test_nothing_changes_without_an_email_service(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No way to send the link (local development): they go straight in, as before."""
    app.dependency_overrides[get_signup_email_sender] = lambda: None

    answer = api.post("/api/v1/auth/register", json=sign_up(EMAIL))

    assert answer.json()["email_verified"] is True
    assert api.get("/api/v1/auth/me").status_code == 200


def test_the_honeypot_refuses_whoever_fills_it(
    api: TestClient, db: Session, sender: FakeSender
) -> None:
    trap = {"X-Form-Trap": "http://spam.example"}

    answer = api.post("/api/v1/auth/register", json=sign_up(EMAIL), headers=trap)
    assert answer.status_code == 400
    assert answer.json()["error"]["code"] == "bot_check_failed"
    assert db.scalars(select(User).where(User.email == EMAIL)).first() is None
    assert sender.sent == []

    for path in ("/auth/login", "/auth/password/forgot", "/auth/email/resend"):
        body = {"email": EMAIL, "password": PASSWORD}
        assert api.post(f"/api/v1{path}", json=body, headers=trap).status_code == 400, path
