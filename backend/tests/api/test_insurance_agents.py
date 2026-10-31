"""Insurance agents: same access as brokers, with a license number instead of an FMCSA check."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import get_broker_checker, get_signup_email_sender
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.main import app
from app.models import Organization, User
from app.models.enums import OrganizationKind, UserRole
from tests.api.test_auth import PASSWORD

EMAIL = "agent@agency.test"
REGISTER = "/api/v1/auth/insurance/register"
BODY = {
    "full_name": "Sam Agent",
    "company_name": "Safe Cover Agency",
    "email": EMAIL,
    "phone": "(610) 590-0223",
    "password": PASSWORD,
    "license_number": "1234567",
}


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


def stored(db: Session) -> User:
    return db.scalars(select(User).where(User.email == EMAIL)).one()


def test_an_agent_signs_up_and_lands_in_the_shared_portal(api: TestClient, db: Session) -> None:
    answer = api.post(REGISTER, json=BODY)

    assert answer.status_code == 201, answer.text
    body = answer.json()
    assert (body["role"], body["portal"]) == ("INSURANCE_AGENT", "broker")
    assert body["billing"]["state"] == "trial"
    user = stored(db)
    assert user.role == UserRole.INSURANCE_AGENT
    organization = db.get(Organization, user.organization_id)
    assert organization is not None
    assert organization.kind == OrganizationKind.INSURANCE
    assert organization.license_number == "1234567"


def test_no_fmcsa_broker_check_is_made(api: TestClient) -> None:
    def fails() -> None:
        raise AssertionError("agents have no FMCSA broker authority to check")

    app.dependency_overrides[get_broker_checker] = fails
    assert api.post(REGISTER, json=BODY).status_code == 201


def test_an_agent_can_reach_the_broker_portal_but_not_others(api: TestClient) -> None:
    api.post(REGISTER, json=BODY)

    overview = api.get("/api/v1/broker/overview")
    assert overview.status_code == 200
    assert overview.json()["license_number"] == "1234567"
    assert api.get("/api/v1/portal/overview").status_code == 403
    assert api.get("/api/v1/dashboard").status_code == 403


@pytest.mark.parametrize("bad", ["", "abc", "12345678901", "12 34"])
def test_the_license_number_must_be_digits(api: TestClient, bad: str) -> None:
    assert api.post(REGISTER, json={**BODY, "license_number": bad}).status_code == 422


def test_duplicate_email_and_short_password_are_refused(api: TestClient) -> None:
    assert api.post(REGISTER, json={**BODY, "password": "short"}).status_code == 422
    assert api.post(REGISTER, json=BODY).status_code == 201
    api.cookies.clear()
    assert api.post(REGISTER, json=BODY).status_code == 409


def test_they_confirm_their_email_like_everyone_else(
    api: TestClient, sender: FakeSender, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "email_verification_required", True)

    answer = api.post(REGISTER, json=BODY)

    assert answer.json()["email_verified"] is False
    assert api.get("/api/v1/auth/me").status_code == 401
    assert [e["subject"] for e in sender.sent] == ["Confirm your email for CarrierSafetyScan"]


def test_the_welcome_email_speaks_to_agents(api: TestClient, sender: FakeSender) -> None:
    api.post(REGISTER, json=BODY)

    (email,) = sender.sent
    assert "underwrite or quote" in str(email["text"])
    assert "book a load" not in str(email["text"])
    assert "/broker" in str(email["text"])


def test_the_bot_checks_apply(api: TestClient, sender: FakeSender, db: Session) -> None:
    answer = api.post(REGISTER, json=BODY, headers={"X-Form-Trap": "spam"})
    assert answer.status_code == 400
    assert db.scalars(select(User).where(User.email == EMAIL)).first() is None
