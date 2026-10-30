"""The Contact Us form: who gets the message, what it says, and the bot checks. No real email."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.v1.routes.contact import get_contact_email_sender
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.main import app

URL = "/api/v1/contact"
BODY = {
    "full_name": "Pat Owner",
    "email": "Pat@Client.com",
    "phone": "6105550123",
    "company": "Client Trucking",
    "usdot": "295017",
    "message": "Please call me about a <b>DataQs</b> challenge.",
}


class FakeSender:
    def __init__(self, fails: bool = False) -> None:
        self.fails = fails
        self.sent: list[dict[str, object]] = []

    def send(self, **email: object) -> str:
        if self.fails:
            raise RuntimeError("mail is down")
        self.sent.append(email)
        return "id"


@pytest.fixture
def sender() -> FakeSender:
    return FakeSender()


@pytest.fixture
def api(sender: FakeSender, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    limiter.reset()
    monkeypatch.setattr(get_settings(), "compliance_request_email", "sts@sts.test")
    app.dependency_overrides[get_contact_email_sender] = lambda: sender
    yield TestClient(app)
    app.dependency_overrides.pop(get_contact_email_sender, None)
    limiter.reset()


def test_the_message_reaches_sts_with_the_visitors_details(
    api: TestClient, sender: FakeSender
) -> None:
    assert api.post(URL, json=BODY).status_code == 200

    (email,) = sender.sent
    assert email["to"] == ["sts@sts.test"]
    assert email["subject"] == "Contact Us: Pat Owner"
    for part in ("pat@client.com", "6105550123", "Client Trucking", "295017", "call me"):
        assert part in str(email["text"])
    assert "<b>DataQs</b>" not in str(email["html"])  # what they typed is never HTML


def test_test_routing_applies(
    api: TestClient, sender: FakeSender, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "dataqs_email_staff_override", "tester@sts.test")
    api.post(URL, json=BODY)
    assert sender.sent[0]["to"] == ["tester@sts.test"]


def test_only_name_email_and_message_are_needed(api: TestClient, sender: FakeSender) -> None:
    short = {"full_name": "Pat", "email": "pat@client.com", "message": "Hello"}
    assert api.post(URL, json=short).status_code == 200
    assert "Phone:" not in str(sender.sent[0]["text"])


@pytest.mark.parametrize(
    "change",
    [
        {"email": "not-an-email"},
        {"message": "   "},
        {"full_name": ""},
        {"usdot": "12ab"},
        {"message": "x" * 5001},
    ],
)
def test_bad_input_is_refused(api: TestClient, sender: FakeSender, change: dict[str, str]) -> None:
    assert api.post(URL, json={**BODY, **change}).status_code == 422
    assert sender.sent == []


def test_a_line_break_cannot_reach_the_subject(api: TestClient, sender: FakeSender) -> None:
    api.post(URL, json={**BODY, "full_name": "Pat\r\nBcc: spam@example.com"})
    assert sender.sent[0]["subject"] == "Contact Us: Pat Bcc: spam@example.com"


def test_the_page_is_told_when_it_did_not_go(api: TestClient) -> None:
    app.dependency_overrides[get_contact_email_sender] = lambda: FakeSender(fails=True)
    answer = api.post(URL, json=BODY)
    assert answer.status_code == 503
    assert "(800) 498-9820" in answer.json()["error"]["message"]

    app.dependency_overrides[get_contact_email_sender] = lambda: None
    assert api.post(URL, json=BODY).status_code == 503


def test_the_bot_checks_apply(api: TestClient, sender: FakeSender) -> None:
    assert api.post(URL, json=BODY, headers={"X-Form-Trap": "spam"}).status_code == 400
    assert sender.sent == []


def test_messages_are_limited(
    api: TestClient, sender: FakeSender, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    me = {"X-Forwarded-For": "203.0.113.9"}
    for _ in range(5):
        assert api.post(URL, json=BODY, headers=me).status_code == 200
    assert api.post(URL, json=BODY, headers=me).status_code == 429
    assert len(sender.sent) == 5
