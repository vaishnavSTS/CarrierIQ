"""The welcome email on sign-up: to the new login (or, while testing, to the override addresses),
with the trial end and a link to their portal. A fake sender: nothing is really emailed."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import get_signup_email_sender
from app.core.config import get_settings
from app.main import app
from app.models import Carrier, User
from app.models.enums import UserRole, UserStatus
from app.services.welcome_email import send_welcome, welcome_email
from tests.api.test_auth import api, register  # noqa: F401 - fixture
from tests.dataqs.test_compliance_tab import FakeSender


@pytest.fixture
def sender(api: TestClient) -> Iterator[FakeSender]:  # noqa: F811
    fake = FakeSender()
    app.dependency_overrides[get_signup_email_sender] = lambda: fake
    yield fake


def test_a_new_client_gets_a_welcome_email(
    api: TestClient,  # noqa: F811
    db: Session,
    sender: FakeSender,
) -> None:
    db.add(Carrier(usdot_number=295017, legal_name="CLIENT TRUCKING LLC"))
    register(api)
    [email] = sender.sent
    assert email["to"] == ["owner@client.com"]
    assert email["subject"] == "Welcome to CarrierSafetyScan"
    assert "Your free trial runs until" in email["text"] and "$49 a month" in email["text"]
    assert email["text"].rstrip().endswith("http://localhost:5173/portal")
    assert "Open CarrierSafetyScan" in email["html"]


def test_while_testing_it_goes_to_the_override(
    api: TestClient,  # noqa: F811
    db: Session,
    sender: FakeSender,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "dataqs_email_carrier_override", "wesley@sts.test")
    db.add(Carrier(usdot_number=295017, legal_name="CLIENT TRUCKING LLC"))
    register(api)
    [email] = sender.sent
    assert email["to"] == ["wesley@sts.test"]
    assert email["text"].startswith("[Test routing: meant for owner@client.com]")


def test_a_broker_gets_the_broker_version() -> None:
    user = User(id=7, organization_id=1, email="b@broker.test", full_name="Pat Lee")
    user.role, user.status = UserRole.BROKER_ADMIN, UserStatus.ACTIVE
    user.trial_ends_at = datetime(2026, 11, 11, tzinfo=UTC)
    email = welcome_email(user, "Lee Logistics")
    assert email.text.startswith("Hi Pat,") and "Lee Logistics" in email.text
    assert "Compare carriers" in email.text and "November 11, 2026" in email.text
    assert email.text.rstrip().endswith("/broker")


def test_a_failing_mail_service_never_raises() -> None:
    class Broken:
        def send(self, **_: object) -> str:
            raise RuntimeError("mail down")

    user = User(id=8, organization_id=1, email="c@client.test", full_name="Sam")
    user.role = UserRole.CLIENT_ADMIN
    send_welcome(welcome_email(user, "Sam Trucking"), Broken())  # type: ignore[arg-type]
    send_welcome(welcome_email(user, "Sam Trucking"), None)
