"""Sending DataQs emails: over SMTP (SMTP_HOST, e.g. Google Workspace), or through Resend's API
(https://resend.com/docs/api-reference/emails/send-email). SMTP wins when both are set.

Only dataqs_notifications.py calls this, from the outbox; nothing sends email inline with a
request. The SMTP password and the API key are secrets (environment only).
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Protocol

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"


class EmailError(Exception):
    """Sending failed. `permanent` failures (a bad address, a rejected request) are not retried."""

    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent


class EmailSender(Protocol):
    def send(
        self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str
    ) -> str: ...


class ResendSender:
    def __init__(self, api_key: str, sender: str, reply_to: str, timeout: float = 20.0) -> None:
        self.api_key, self.sender, self.reply_to, self.timeout = api_key, sender, reply_to, timeout

    def send(
        self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str
    ) -> str:
        try:
            response = httpx.post(
                RESEND_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    # Resend ignores a repeat with the same key, so a retry never sends twice.
                    "Idempotency-Key": idempotency_key,
                },
                json={
                    "from": self.sender,
                    "to": to,
                    "reply_to": self.reply_to,
                    "subject": subject,
                    "text": text,
                    "html": html,
                },
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:
            raise EmailError(f"Could not reach Resend: {exc.__class__.__name__}") from exc
        if response.status_code >= 400:
            permanent = 400 <= response.status_code < 500 and response.status_code != 429
            detail = response.text[:300]
            raise EmailError(
                f"Resend answered {response.status_code}: {detail}", permanent=permanent
            )
        email_id: str = response.json().get("id", "")
        return email_id


class SmtpSender:
    """Any SMTP server. Google Workspace: smtp.gmail.com, port 587, STARTTLS, the mailbox's
    address and an App Password (Google account → Security → App passwords)."""

    def __init__(
        self,
        host: str,
        port: int,
        username: str | None,
        password: str | None,
        security: str,
        sender: str,
        reply_to: str,
        timeout: float = 30.0,
    ) -> None:
        self.host, self.port, self.security, self.timeout = host, port, security, timeout
        self.username, self.password = username, password
        self.sender, self.reply_to = sender, reply_to

    def _message(self, to: list[str], subject: str, text: str, html: str, key: str) -> EmailMessage:
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = ", ".join(to)
        message["Reply-To"] = self.reply_to
        message["Subject"] = subject
        message["Date"] = formatdate(localtime=False)
        domain = self.sender.rsplit("@", 1)[-1].rstrip(">").strip() or None
        # The outbox event id in the Message-ID: a resend after a lost reply is recognisable.
        message["Message-ID"] = make_msgid(idstring=key.replace("@", "-"), domain=domain)
        message.set_content(text)
        message.add_alternative(html, subtype="html")
        return message

    def send(
        self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str
    ) -> str:
        message = self._message(to, subject, text, html, idempotency_key)
        context = ssl.create_default_context()
        try:
            if self.security == "ssl":
                client: smtplib.SMTP = smtplib.SMTP_SSL(
                    self.host, self.port, timeout=self.timeout, context=context
                )
            else:
                client = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
            with client:
                if self.security == "starttls":
                    client.starttls(context=context)
                if self.username and self.password:
                    client.login(self.username, self.password)
                client.send_message(message)
        except smtplib.SMTPRecipientsRefused as exc:
            raise EmailError(f"The mail server refused the address: {exc}", permanent=True) from exc
        except smtplib.SMTPAuthenticationError as exc:
            raise EmailError(
                "The mail server refused the login (check SMTP_USERNAME / SMTP_PASSWORD)"
            ) from exc
        except (smtplib.SMTPException, OSError) as exc:
            raise EmailError(
                f"Could not send through {self.host}: {exc.__class__.__name__}"
            ) from exc
        return str(message["Message-ID"])


def get_email_sender() -> EmailSender | None:
    """SMTP when SMTP_HOST is set, else Resend when RESEND_API_KEY is set, else None (emails
    then wait in the outbox)."""
    settings = get_settings()
    if settings.smtp_host:
        return SmtpSender(
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_username,
            settings.smtp_password,
            settings.smtp_security.lower(),
            settings.dataqs_email_from,
            settings.dataqs_email_reply_to,
        )
    if not settings.resend_api_key:
        return None
    return ResendSender(
        settings.resend_api_key, settings.dataqs_email_from, settings.dataqs_email_reply_to
    )
