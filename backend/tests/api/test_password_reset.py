"""Forgot password and reset password: the flow, and what must not work."""

import re
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import get_signup_email_sender
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.security import create_purpose_token, read_session_token
from app.db.session import get_db
from app.main import app
from app.models import User
from app.models.enums import UserRole, UserStatus
from tests.api.test_auth import PASSWORD, make_user

NEW_PASSWORD = "a-brand-new-password"
FORGOT = "/api/v1/auth/password/forgot"
RESET = "/api/v1/auth/password/reset"


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
def api(db: Session, real_auth: None, sender: FakeSender) -> Iterator[TestClient]:
    limiter.reset()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_signup_email_sender] = lambda: sender
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    limiter.reset()


def client_user(db: Session, status: UserStatus = UserStatus.ACTIVE) -> User:
    return make_user(db, "owner@client.com", UserRole.CLIENT_ADMIN, status)


def token_from(sender: FakeSender) -> str:
    match = re.search(r"#token=(\S+)", str(sender.sent[-1]["text"]))
    assert match
    return match.group(1)


def can_log_in(api: TestClient, password: str) -> bool:
    answer = api.post(
        "/api/v1/auth/login", json={"email": "owner@client.com", "password": password}
    )
    return answer.status_code == 200


def test_forgot_then_reset_changes_the_password(
    api: TestClient, db: Session, sender: FakeSender
) -> None:
    client_user(db)

    assert api.post(FORGOT, json={"email": "Owner@Client.com"}).status_code == 200
    assert sender.sent[0]["to"] == ["owner@client.com"]
    token = token_from(sender)

    answer = api.post(RESET, json={"token": token, "password": NEW_PASSWORD})

    assert answer.status_code == 200
    assert can_log_in(api, NEW_PASSWORD)
    assert not can_log_in(api, PASSWORD)


def test_the_answer_does_not_say_whether_an_account_exists(
    api: TestClient, db: Session, sender: FakeSender
) -> None:
    client_user(db)

    known = api.post(FORGOT, json={"email": "owner@client.com"})
    unknown = api.post(FORGOT, json={"email": "nobody@client.com"})

    assert (known.status_code, known.json()) == (unknown.status_code, unknown.json())
    assert len(sender.sent) == 1


def test_a_link_works_once(api: TestClient, db: Session, sender: FakeSender) -> None:
    client_user(db)
    api.post(FORGOT, json={"email": "owner@client.com"})
    token = token_from(sender)
    assert api.post(RESET, json={"token": token, "password": NEW_PASSWORD}).status_code == 200

    again = api.post(RESET, json={"token": token, "password": "yet-another-password"})

    assert again.status_code == 422
    assert can_log_in(api, NEW_PASSWORD)


def test_a_forged_or_expired_link_is_refused(api: TestClient, db: Session) -> None:
    user = client_user(db)
    claims = {"sub": str(user.id), "fp": "wrong"}
    forged = create_purpose_token(claims, "password_reset", 30)
    expired = create_purpose_token(claims, "password_reset", -1)
    other = create_purpose_token({"sub": str(user.id)}, "google_signup", 30)

    for token in (forged, expired, other, "garbage"):
        answer = api.post(RESET, json={"token": token, "password": NEW_PASSWORD})
        assert answer.status_code == 422, token
    assert can_log_in(api, PASSWORD)


def test_a_reset_token_is_never_a_session(api: TestClient, db: Session, sender: FakeSender) -> None:
    client_user(db)
    api.post(FORGOT, json={"email": "owner@client.com"})
    assert read_session_token(token_from(sender)) is None


def test_a_short_password_is_refused(api: TestClient, db: Session, sender: FakeSender) -> None:
    client_user(db)
    api.post(FORGOT, json={"email": "owner@client.com"})

    answer = api.post(RESET, json={"token": token_from(sender), "password": "short"})

    assert answer.status_code == 422
    assert can_log_in(api, PASSWORD)


def test_a_disabled_account_gets_no_email(api: TestClient, db: Session, sender: FakeSender) -> None:
    client_user(db, UserStatus.DISABLED)
    assert api.post(FORGOT, json={"email": "owner@client.com"}).status_code == 200
    assert sender.sent == []


def test_a_reset_lifts_the_wrong_password_block(
    api: TestClient, db: Session, sender: FakeSender, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    client_user(db)
    for n in range(3):
        wrong = {"email": "owner@client.com", "password": "wrong-password"}
        api.post("/api/v1/auth/login", json=wrong, headers={"X-Forwarded-For": f"203.0.113.{n}"})
    locked = {"email": "owner@client.com", "password": PASSWORD}
    assert api.post("/api/v1/auth/login", json=locked).status_code == 429

    api.post(FORGOT, json={"email": "owner@client.com"})
    api.post(RESET, json={"token": token_from(sender), "password": NEW_PASSWORD})

    assert can_log_in(api, NEW_PASSWORD)


def test_one_address_gets_a_limited_number_of_emails(
    api: TestClient, db: Session, sender: FakeSender, monkeypatch: pytest.MonkeyPatch
) -> None:
    """From many addresses, the answer stays the same but the inbox isn't flooded."""
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    client_user(db)

    for n in range(6):
        answer = api.post(
            FORGOT,
            json={"email": "owner@client.com"},
            headers={"X-Forwarded-For": f"203.0.113.{n}"},
        )
        assert answer.status_code == 200

    assert len(sender.sent) == 3


def test_forgot_is_limited_per_visitor(
    api: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    me = {"X-Forwarded-For": "203.0.113.50"}
    for n in range(5):
        api.post(FORGOT, json={"email": f"user{n}@client.com"}, headers=me)

    assert api.post(FORGOT, json={"email": "z@client.com"}, headers=me).status_code == 429


def test_test_routing_sends_it_to_the_override(
    api: TestClient, db: Session, sender: FakeSender, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "dataqs_email_carrier_override", "tester@sts.test")
    client_user(db)

    api.post(FORGOT, json={"email": "owner@client.com"})

    assert sender.sent[0]["to"] == ["tester@sts.test"]
    assert "meant for owner@client.com" in str(sender.sent[0]["text"])
