"""Admin Monitored DOTs: STS admins add, list and remove the USDOT numbers they monitor."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_refresh_service
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.main import app
from app.models import Carrier, MonitoredCarrier, User
from app.models.enums import UserRole, UserStatus
from app.services.carrier_refresh_service import RefreshOutcome
from tests.api.test_auth import log_in, make_user
from tests.factories import make_carrier

MONITORED = "/api/v1/admin/monitored"
KNOWN = 2465630  # in FMCSA's data (the fake below loads it)
UNKNOWN = 9999999  # not in FMCSA's data


class FakeRefresh:
    """Loads KNOWN as a search would; any other number isn't in FMCSA's data."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.asked: list[int] = []

    def ensure_fresh(self, usdot_number: int, *, force: bool = False) -> RefreshOutcome:
        self.asked.append(usdot_number)
        carrier = self.db.scalar(select(Carrier).where(Carrier.usdot_number == usdot_number))
        if carrier is None and usdot_number == KNOWN:
            carrier = make_carrier(self.db, KNOWN, "SABLOK BROTHERS TRUCKING")
        return RefreshOutcome(carrier, refreshed=carrier is not None, stale=False)


@pytest.fixture
def refresh(db: Session) -> FakeRefresh:
    return FakeRefresh(db)


@pytest.fixture
def api(db: Session, real_auth: None, refresh: FakeRefresh) -> Iterator[TestClient]:
    limiter.reset()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_refresh_service] = lambda: refresh
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    limiter.reset()


def as_admin(api: TestClient, db: Session, email: str = "admin@sts.test") -> User:
    admin = make_user(db, email, UserRole.STS_ADMIN, UserStatus.ACTIVE)
    log_in(api, email)
    return admin


def test_admin_adds_a_dot_and_sees_it_with_the_company_name(
    api: TestClient, db: Session, refresh: FakeRefresh
) -> None:
    admin = as_admin(api, db)

    added = api.post(MONITORED, json={"usdot_number": KNOWN})

    assert added.status_code == 201, added.text
    body = added.json()
    assert (body["usdot_number"], body["legal_name"], body["added_by"]) == (
        KNOWN,
        "SABLOK BROTHERS TRUCKING",
        admin.full_name,
    )
    assert refresh.asked == [KNOWN]  # loaded from FMCSA, so the report opens straight away
    listed = api.get(MONITORED).json()
    assert [(r["usdot_number"], r["legal_name"]) for r in listed] == [
        (KNOWN, "SABLOK BROTHERS TRUCKING")
    ]
    assert listed[0]["added_at"] == body["added_at"]


def test_newest_first_and_a_carrier_already_loaded_keeps_its_name(
    api: TestClient, db: Session
) -> None:
    as_admin(api, db)
    make_carrier(db, 1234567, "ACME TRUCKING LLC")

    assert api.post(MONITORED, json={"usdot_number": KNOWN}).status_code == 201
    assert api.post(MONITORED, json={"usdot_number": 1234567}).status_code == 201

    assert [r["usdot_number"] for r in api.get(MONITORED).json()] == [1234567, KNOWN]


def test_a_dot_fmcsa_does_not_know_is_refused(api: TestClient, db: Session) -> None:
    as_admin(api, db)

    answer = api.post(MONITORED, json={"usdot_number": UNKNOWN})

    assert answer.status_code == 404
    assert db.scalar(select(MonitoredCarrier)) is None


def test_the_same_dot_twice_is_refused(api: TestClient, db: Session) -> None:
    as_admin(api, db)
    api.post(MONITORED, json={"usdot_number": KNOWN})

    again = api.post(MONITORED, json={"usdot_number": KNOWN})

    assert again.status_code == 409
    assert "already monitored" in again.text


@pytest.mark.parametrize("usdot", [0, -5, 100_000_000])
def test_an_impossible_number_is_refused(api: TestClient, db: Session, usdot: int) -> None:
    as_admin(api, db)

    assert api.post(MONITORED, json={"usdot_number": usdot}).status_code == 422


def test_admin_removes_a_dot(api: TestClient, db: Session) -> None:
    as_admin(api, db)
    api.post(MONITORED, json={"usdot_number": KNOWN})

    assert api.delete(f"{MONITORED}/{KNOWN}").status_code == 204
    assert api.get(MONITORED).json() == []
    assert api.delete(f"{MONITORED}/{KNOWN}").status_code == 404


@pytest.mark.parametrize("role", [UserRole.STS_ANALYST, UserRole.CLIENT_ADMIN])
def test_only_sts_admins_use_the_list(api: TestClient, db: Session, role: UserRole) -> None:
    make_user(db, "someone@test.com", role, UserStatus.ACTIVE)
    log_in(api, "someone@test.com")

    assert api.get(MONITORED).status_code == 403
    assert api.post(MONITORED, json={"usdot_number": KNOWN}).status_code == 403


def test_deleting_the_admin_who_added_a_dot_keeps_the_dot(api: TestClient, db: Session) -> None:
    as_admin(api, db, "first@sts.test")
    api.post(MONITORED, json={"usdot_number": KNOWN})
    first = db.scalar(select(User).where(User.email == "first@sts.test"))
    assert first is not None
    as_admin(api, db, "second@sts.test")

    assert api.delete(f"/api/v1/admin/users/{first.id}").status_code == 204

    listed = api.get(MONITORED).json()
    assert [(r["usdot_number"], r["added_by"]) for r in listed] == [(KNOWN, None)]
