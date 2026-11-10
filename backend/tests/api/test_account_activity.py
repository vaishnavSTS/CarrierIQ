"""Account history activity: what each person searched, and which carriers and tabs they opened."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_socrata_client
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.main import app
from app.models import AccountEvent, User
from app.models.enums import UserRole, UserStatus
from tests.api.test_auth import log_in, make_user
from tests.ingestion.helpers import FakeDotApi, load_inspection_rows
from tests.services.test_carrier_search import UNITED

LOG = "/api/v1/admin/account-log"
VIEW = "/api/v1/activity/carrier-view"
USDOT = 295017  # UNITED MOVING AND STORAGE INC in the fake FMCSA answers


@pytest.fixture
def api(db: Session, real_auth: None) -> Iterator[TestClient]:
    limiter.reset()
    headers, units = load_inspection_rows()
    fmcsa = FakeDotApi([UNITED], headers, units)

    def fake_client() -> Iterator[Any]:
        yield fmcsa.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    limiter.reset()


def activity(db: Session, user: User) -> list[tuple[str, str | None, int | None, str | None]]:
    rows = db.scalars(
        select(AccountEvent)
        .where(
            AccountEvent.user_id == user.id,
            AccountEvent.event.in_(["SEARCHED", "CARRIER_VIEWED"]),
        )
        .order_by(AccountEvent.id)
    )
    return [(e.event, e.detail, e.usdot_number, e.page) for e in rows]


def test_a_brokers_search_is_kept_with_what_was_typed(api: TestClient, db: Session) -> None:
    broker = make_user(db, "bo@broker.test", UserRole.BROKER_ADMIN, UserStatus.ACTIVE)
    log_in(api, broker.email)

    assert api.get("/api/v1/broker/search", params={"q": str(USDOT)}).status_code == 200
    assert api.get("/api/v1/broker/search", params={"q": "nothing like it"}).status_code == 200

    assert activity(db, broker) == [
        ("SEARCHED", f'"{USDOT}" · 1 result', USDOT, None),
        ("SEARCHED", '"nothing like it" · 0 results', None, None),
    ]


def test_each_carrier_tab_opened_is_kept_once_per_ten_minutes(api: TestClient, db: Session) -> None:
    agent = make_user(db, "al@agency.test", UserRole.INSURANCE_AGENT, UserStatus.ACTIVE)
    log_in(api, agent.email)

    for tab in ("identity", "safety", "safety", "insurance"):
        assert api.post(VIEW, json={"usdot_number": USDOT, "tab": tab}).status_code == 204

    assert [(e, u, p) for e, _, u, p in activity(db, agent)] == [
        ("CARRIER_VIEWED", USDOT, "identity"),
        ("CARRIER_VIEWED", USDOT, "safety"),  # opened twice in a row: kept once
        ("CARRIER_VIEWED", USDOT, "insurance"),
    ]

    # Ten minutes later the same tab is a new visit.
    db.execute(
        update(AccountEvent)
        .where(AccountEvent.page == "safety")
        .values(created_at=datetime.now(UTC) - timedelta(minutes=11))
    )
    api.post(VIEW, json={"usdot_number": USDOT, "tab": "safety"})
    assert [p for *_, p in activity(db, agent)].count("safety") == 2


def test_only_real_tabs_and_logged_in_people(api: TestClient, db: Session) -> None:
    assert api.post(VIEW, json={"usdot_number": USDOT, "tab": "identity"}).status_code == 401
    make_user(db, "bo@broker.test", UserRole.BROKER_ADMIN, UserStatus.ACTIVE)
    log_in(api, "bo@broker.test")
    assert api.post(VIEW, json={"usdot_number": USDOT, "tab": "admin"}).status_code == 422
    assert api.post(VIEW, json={"usdot_number": 0, "tab": "safety"}).status_code == 422


def test_admins_see_activity_in_the_history_with_the_carrier_name(
    api: TestClient, db: Session
) -> None:
    broker = make_user(db, "bo@broker.test", UserRole.BROKER_ADMIN, UserStatus.ACTIVE)
    log_in(api, broker.email)
    api.get("/api/v1/broker/search", params={"q": str(USDOT)})  # loads the carrier too
    api.post(VIEW, json={"usdot_number": USDOT, "tab": "safety-score-report"})

    make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)
    log_in(api, "admin@sts.test")
    body = api.get(LOG, params={"user_id": broker.id, "group": "activity"}).json()

    assert [(e["event"], e["usdot_number"], e["page"]) for e in body["events"]] == [
        ("CARRIER_VIEWED", USDOT, "safety-score-report"),
        ("SEARCHED", USDOT, None),
    ]
    assert body["events"][0]["carrier_name"] == "UNITED MOVING AND STORAGE INC"
    # Activity isn't mixed into the account changes, and logins stay apart.
    changes = api.get(LOG, params={"user_id": broker.id, "group": "account"}).json()["events"]
    assert all(e["event"] not in ("SEARCHED", "CARRIER_VIEWED") for e in changes)
