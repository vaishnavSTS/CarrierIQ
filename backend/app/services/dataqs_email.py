"""Sending DataQs emails through Resend (https://resend.com/docs/api-reference/emails/send-email).

Only dataqs_notifications.py calls this, from the outbox; nothing sends email inline with a
request. The API key is a secret (RESEND_API_KEY, environment only).
"""

import logging
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


def get_email_sender() -> EmailSender | None:
    """None while RESEND_API_KEY is unset: emails then wait in the outbox."""
    settings = get_settings()
    if not settings.resend_api_key:
        return None
    return ResendSender(
        settings.resend_api_key, settings.dataqs_email_from, settings.dataqs_email_reply_to
    )
