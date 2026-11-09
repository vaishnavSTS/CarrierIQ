"""Account logs: every login, failed login, logout and account change is kept, and STS admins read
them for all accounts or one account's history."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import get_google_client
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.main import app
from app.models import AccountEvent, User
from app.models.enums import UserRole, UserStatus
from tests.api.test_auth import PASSWORD, log_in, make_user, sign_up
from tests.api.test_google_sign_in import FakeGoogle, round_trip

LOG = "/api/v1/admin/account-log"
LOGIN = "/api/v1/auth/login"
CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36"


@pytest.fixture
def api(db: Session, real_auth: None) -> Iterator[TestClient]:
    limiter.reset()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app, headers={"user-agent": CHROME}) as client:
        yield client
    app.dependency_overrides.clear()
    limiter.reset()


def admin_logged_in(api: TestClient, db: Session) -> User:
    admin = make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)
    admin.full_name = "Ada Admin"
    db.flush()
    log_in(api, admin.email)
    return admin


def events(db: Session) -> list[AccountEvent]:
    return list(db.scalars(select(AccountEvent).order_by(AccountEvent.id)))


def read_log(api: TestClient, **params: Any) -> dict[str, Any]:
    response = api.get(LOG, params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def test_a_login_and_logout_are_kept_with_where_they_came_from(
    api: TestClient, db: Session
) -> None:
    user = make_user(db, "pat@carrier.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)

    api.post(
        LOGIN,
        json={"email": "Pat@Carrier.test", "password": PASSWORD},
        headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1"},
    )
    api.post("/api/v1/auth/logout")

    rows = [(e.event, e.user_id, e.detail, e.ip, e.user_agent) for e in events(db)]
    assert rows == [
        ("LOGIN", user.id, "Password", "203.0.113.7", CHROME),
        ("LOGOUT", user.id, None, "testclient", CHROME),
    ]


def test_failed_logins_say_why_and_never_keep_the_password(api: TestClient, db: Session) -> None:
    user = make_user(db, "pat@carrier.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    make_user(db, "gone@carrier.test", UserRole.CLIENT_ADMIN, UserStatus.DISABLED)

    for email, password in [
        ("pat@carrier.test", "not-the-password"),
        ("Nobody@Nowhere.test", "guess-123"),
        ("gone@carrier.test", PASSWORD),
    ]:
        assert api.post(LOGIN, json={"email": email, "password": password}).status_code in (
            401,
            403,
        )

    rows = [(e.event, e.user_id, e.email, e.detail) for e in events(db)]
    assert rows[0] == ("LOGIN_FAILED", user.id, "pat@carrier.test", "Wrong password")
    assert rows[1] == ("LOGIN_FAILED", None, "nobody@nowhere.test", "No account with this email")
    assert rows[2][0::3] == ("LOGIN_FAILED", "Account is disabled")
    stored = " ".join(str(v) for e in events(db) for v in vars(e).values())
    assert "not-the-password" not in stored and "guess-123" not in stored


def test_too_many_wrong_passwords_is_logged_as_a_lockout(
    api: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    make_user(db, "pat@carrier.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    bad = {"email": "pat@carrier.test", "password": "wrong-wrong"}

    # 3 wrong passwords lock the account; 5 a minute is the limit for one address anyway
    codes = [api.post(LOGIN, json=bad).status_code for _ in range(5)]

    assert 429 in codes
    details = {e.detail for e in events(db)}
    assert details == {"Wrong password", "Too many wrong passwords: locked for a while"}


def test_a_sign_up_is_kept_with_the_login_that_follows(api: TestClient, db: Session) -> None:
    response = api.post("/api/v1/auth/register", json=sign_up("new@carrier.test"))
    assert response.status_code == 201, response.text

    rows = [(e.event, e.detail) for e in events(db)]
    assert rows == [
        ("SIGNED_UP", "Carrier sign-up, with a password"),
        ("LOGIN", "Right after signing up"),
    ]


def test_google_logins_and_refusals_are_kept(
    db: Session, real_auth: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "google_client_id", "id.apps.googleusercontent.com")
    monkeypatch.setattr(get_settings(), "google_client_secret", "secret")
    google = FakeGoogle()
    user = make_user(db, "new@gmail.com", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_google_client] = lambda: google
    try:
        with TestClient(app, follow_redirects=False) as client:
            assert round_trip(client) == "/portal"
            user.status = UserStatus.DISABLED
            db.flush()
            assert round_trip(client) == "/login?google=disabled"
    finally:
        app.dependency_overrides.clear()

    rows = [(e.event, e.user_id, e.detail) for e in events(db)]
    assert rows == [
        ("LOGIN", user.id, "Google"),
        ("LOGIN_FAILED", user.id, "Google: Account is disabled"),
    ]


def test_admin_changes_are_kept_with_who_made_them(api: TestClient, db: Session) -> None:
    admin = admin_logged_in(api, db)
    pat = make_user(db, "pat@carrier.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)

    assert api.post(f"/api/v1/admin/users/{pat.id}/disable").status_code == 200
    assert api.post(f"/api/v1/admin/users/{pat.id}/reactivate").status_code == 200

    history = read_log(api, user_id=pat.id)
    assert [(e["event"], e["actor_name"]) for e in history["events"]] == [
        ("REACTIVATED", admin.full_name),
        ("DISABLED", admin.full_name),
    ]


def test_a_deleted_accounts_history_stays_under_its_email(api: TestClient, db: Session) -> None:
    admin_logged_in(api, db)
    pat = make_user(db, "pat@carrier.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    api.post(LOGIN, json={"email": pat.email, "password": "wrong-wrong"})
    log_in(api, "admin@sts.test")  # the failed try above didn't change who is logged in

    assert api.delete(f"/api/v1/admin/users/{pat.id}").status_code == 204

    found = read_log(api, q="pat@carrier")["events"]
    assert [(e["event"], e["user_id"], e["account_email"]) for e in found] == [
        ("DELETED", None, "pat@carrier.test"),
        ("LOGIN_FAILED", None, "pat@carrier.test"),
    ]


def test_one_accounts_history_comes_with_a_summary(api: TestClient, db: Session) -> None:
    admin_logged_in(api, db)
    pat = make_user(db, "pat@carrier.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    api.post(LOGIN, json={"email": pat.email, "password": "wrong-wrong"})
    log_in(api, pat.email)
    log_in(api, "admin@sts.test")

    body = read_log(api, user_id=pat.id)

    summary = body["account"]
    assert (summary["email"], summary["logins_30d"], summary["failed_logins_30d"]) == (
        pat.email,
        1,
        1,
    )
    assert summary["last_failed_login_at"] is not None
    assert [e["event"] for e in body["events"]] == ["LOGIN", "LOGIN_FAILED"]
    assert read_log(api)["account"] is None


def test_filters_search_and_pages(api: TestClient, db: Session) -> None:
    admin_logged_in(api, db)  # 1 login
    for _ in range(3):
        api.post(LOGIN, json={"email": "who@nowhere.test", "password": "nope-nope"})
    log_in(api, "admin@sts.test")

    assert [e["event"] for e in read_log(api, group="failed")["events"]] == ["LOGIN_FAILED"] * 3
    assert {e["event"] for e in read_log(api, group="logins")["events"]} == {"LOGIN"}
    assert read_log(api, group="account")["events"] == []
    assert len(read_log(api, q="NOWHERE")["events"]) == 3

    first = read_log(api, limit=2)
    assert first["has_more"] is True
    rest = read_log(api, limit=10, before=first["events"][-1]["id"])
    assert rest["has_more"] is False
    ids = [e["id"] for e in first["events"] + rest["events"]]
    assert ids == sorted(ids, reverse=True) and len(ids) == 5


def test_only_sts_admins_read_the_log(api: TestClient, db: Session) -> None:
    for email, role in [
        ("analyst@sts.test", UserRole.STS_ANALYST),
        ("pat@carrier.test", UserRole.CLIENT_ADMIN),
    ]:
        make_user(db, email, role, UserStatus.ACTIVE)
        log_in(api, email)
        assert api.get(LOG).status_code == 403
    admin_logged_in(api, db)
    assert api.get(LOG, params={"user_id": 999_999}).status_code == 404
