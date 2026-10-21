"""Sending DataQs emails over SMTP (services/dataqs_email.py), against a stand-in SMTP server."""

import smtplib
from email.message import EmailMessage
from typing import Any

import pytest

from app.core.config import get_settings
from app.services import dataqs_email
from app.services.dataqs_email import EmailError, ResendSender, SmtpSender, get_email_sender


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
    monkeypatch.setattr(dataqs_email.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(dataqs_email.smtplib, "SMTP_SSL", FakeSMTP)


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
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "resend_api_key", None)
    assert get_email_sender() is None
    assert settings.dataqs_email_enabled is False

    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    assert isinstance(get_email_sender(), ResendSender)

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    assert isinstance(get_email_sender(), SmtpSender)
    assert settings.dataqs_email_enabled is True
