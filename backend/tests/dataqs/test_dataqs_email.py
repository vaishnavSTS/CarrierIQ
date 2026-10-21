"""Sending DataQs emails over SMTP (services/dataqs_email.py), against a stand-in SMTP server."""

import base64
import email
import smtplib
from email.message import EmailMessage
from typing import Any

import httpx
import pytest

from app.core.config import get_settings
from app.services import dataqs_email
from app.services.dataqs_email import (
    EmailError,
    GmailApiSender,
    ResendSender,
    SmtpSender,
    get_email_sender,
)
from app.workers.gmail_authorize import set_env_value


class FakeSMTP:
    """Records what the sender does instead of talking to a mail server."""

    instances: list["FakeSMTP"] = []
    fail: Exception | None = None

    def __init__(self, host: str, port: int, timeout: float = 0, **_: Any) -> None:
        self.host, self.port = host, port
        self.calls: list[str] = []
        self.sent: list[EmailMessage] = []
        FakeSMTP.instances.append(self)

    def __enter__(self) -> "FakeSMTP":
        return self

    def __exit__(self, *_: Any) -> None:
        self.calls.append("quit")

    def starttls(self, context: Any = None) -> None:
        self.calls.append("starttls")

    def login(self, user: str, password: str) -> None:
        self.calls.append(f"login:{user}")

    def send_message(self, message: EmailMessage) -> None:
        if FakeSMTP.fail:
            raise FakeSMTP.fail
        self.sent.append(message)


@pytest.fixture(autouse=True)
def fake_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeSMTP.instances, FakeSMTP.fail = [], None
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTP)


def _sender(security: str = "starttls") -> SmtpSender:
    return SmtpSender(
        "smtp.gmail.com",
        587,
        "dataqs@sts.test",
        "app-password",
        security,
        "Sky Transport Solutions <dataqs@sts.test>",
        "info@sts.test",
    )


def _send(sender: SmtpSender) -> str:
    return sender.send(
        to=["carrier@acme.test"],
        subject="Your DataQs file #7 is closed",
        text="Plain text",
        html="<p>HTML</p>",
        idempotency_key="dataqs-msg-7-u3",
    )


def test_smtp_sends_a_text_and_html_email_with_starttls_and_login() -> None:
    message_id = _send(_sender())
    [server] = FakeSMTP.instances
    assert (server.host, server.port) == ("smtp.gmail.com", 587)
    assert server.calls[:2] == ["starttls", "login:dataqs@sts.test"]
    [message] = server.sent
    assert message["To"] == "carrier@acme.test"
    assert message["From"] == "Sky Transport Solutions <dataqs@sts.test>"
    assert message["Reply-To"] == "info@sts.test"
    assert message["Subject"] == "Your DataQs file #7 is closed"
    assert "dataqs-msg-7-u3" in message_id
    kinds = [part.get_content_type() for part in message.iter_parts()]
    assert kinds == ["text/plain", "text/html"]


def test_ssl_mode_skips_starttls() -> None:
    _send(_sender("ssl"))
    assert "starttls" not in FakeSMTP.instances[0].calls


def test_a_refused_address_is_permanent_and_other_failures_retry() -> None:
    FakeSMTP.fail = smtplib.SMTPRecipientsRefused({"carrier@acme.test": (550, b"no such user")})
    with pytest.raises(EmailError) as refused:
        _send(_sender())
    assert refused.value.permanent

    FakeSMTP.fail = smtplib.SMTPAuthenticationError(535, b"bad login")
    with pytest.raises(EmailError) as login:
        _send(_sender())
    assert not login.value.permanent and "SMTP_PASSWORD" in str(login.value)

    FakeSMTP.fail = OSError("connection reset")
    with pytest.raises(EmailError) as network:
        _send(_sender())
    assert not network.value.permanent


def test_smtp_is_used_when_set_otherwise_resend(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "gmail_refresh_token", None)
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "resend_api_key", None)
    assert get_email_sender() is None
    assert settings.dataqs_email_enabled is False

    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    assert isinstance(get_email_sender(), ResendSender)

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    assert isinstance(get_email_sender(), SmtpSender)
    assert settings.dataqs_email_enabled is True


# --- Gmail API (HTTPS) ---


class FakeGoogle:
    """Answers Google's token and Gmail send endpoints, recording the calls."""

    def __init__(self) -> None:
        self.token_calls = 0
        self.sent: list[dict[str, Any]] = []
        self.token_answer = httpx.Response(200, json={"access_token": "at-1", "expires_in": 3600})
        self.send_answers: list[httpx.Response] = []

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        if url == dataqs_email.GOOGLE_TOKEN_URL:
            self.token_calls += 1
            assert kwargs["data"]["grant_type"] == "refresh_token"
            return self.token_answer
        assert url == dataqs_email.GMAIL_SEND_URL
        self.sent.append(kwargs)
        if self.send_answers:
            return self.send_answers.pop(0)
        return httpx.Response(200, json={"id": "gmail-id-1"})


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> FakeGoogle:
    fake = FakeGoogle()
    monkeypatch.setattr(httpx, "post", fake.post)
    monkeypatch.setattr(dataqs_email, "_access_tokens", {})
    return fake


def _gmail() -> GmailApiSender:
    return GmailApiSender(
        "client-id", "client-secret", "refresh-1", "Sky <dataqs@sts.test>", "info@sts.test"
    )


def _gmail_send() -> str:
    return _gmail().send(
        to=["carrier@acme.test"],
        subject="Filed",
        text="Plain",
        html="<p>HTML</p>",
        idempotency_key="dataqs-msg-9-u1",
    )


def test_gmail_api_sends_the_email_with_a_fresh_access_token(google: FakeGoogle) -> None:
    assert _gmail_send() == "gmail-id-1"
    [call] = google.sent
    assert call["headers"]["Authorization"] == "Bearer at-1"
    message = email.message_from_bytes(base64.urlsafe_b64decode(call["json"]["raw"]))
    assert message["To"] == "carrier@acme.test"
    assert message["Reply-To"] == "info@sts.test"
    assert message["Subject"] == "Filed"
    assert "dataqs-msg-9-u1" in message["Message-ID"]

    _gmail_send()  # the access token is reused until it expires
    assert google.token_calls == 1


def test_gmail_api_errors(google: FakeGoogle) -> None:
    google.send_answers = [httpx.Response(400, text="Invalid To header")]
    with pytest.raises(EmailError) as bad_address:
        _gmail_send()
    assert bad_address.value.permanent

    google.send_answers = [httpx.Response(429, text="rate limited")]
    with pytest.raises(EmailError) as limited:
        _gmail_send()
    assert not limited.value.permanent

    google.send_answers = [httpx.Response(401, text="expired")]
    with pytest.raises(EmailError) as expired:
        _gmail_send()
    assert not expired.value.permanent
    _gmail_send()  # a new access token after the 401
    assert google.token_calls == 2


def test_a_revoked_gmail_token_says_how_to_fix_it_and_retries(google: FakeGoogle) -> None:
    google.token_answer = httpx.Response(400, json={"error": "invalid_grant"})
    with pytest.raises(EmailError) as revoked:
        _gmail_send()
    assert not revoked.value.permanent
    assert "gmail_authorize" in str(revoked.value)
    assert google.sent == []


def test_the_gmail_api_wins_over_smtp_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "gmail_client_id", "id")
    monkeypatch.setattr(settings, "gmail_client_secret", "secret")
    monkeypatch.setattr(settings, "gmail_refresh_token", "token")
    assert isinstance(get_email_sender(), GmailApiSender)
    assert settings.dataqs_email_enabled is True


def test_the_authorize_helper_replaces_or_adds_the_token_line() -> None:
    env = "A=1\nGMAIL_REFRESH_TOKEN=old\nB=2\n"
    replaced = set_env_value(env, "GMAIL_REFRESH_TOKEN", "new")
    assert replaced == "A=1\nGMAIL_REFRESH_TOKEN=new\nB=2\n"
    added = set_env_value("A=1\n", "GMAIL_REFRESH_TOKEN", "new")
    assert added == "A=1\nGMAIL_REFRESH_TOKEN=new\n"
