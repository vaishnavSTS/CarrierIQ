"""Sending DataQs emails, through the first one configured:

1. the Gmail API (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN): HTTPS, so it
   works where outgoing SMTP is blocked (Render's free plan);
2. SMTP (SMTP_HOST, e.g. smtp.gmail.com with an App Password);
3. Resend's API (https://resend.com/docs/api-reference/emails/send-email).

Only dataqs_notifications.py calls this, from the outbox; nothing sends email inline with a
request. Secrets, tokens and passwords come from the environment only.
"""

import base64
import logging
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Protocol

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"


class EmailError(Exception):
    """Sending failed. `permanent` failures (a bad address, a rejected request) are not retried."""

    def __init__(self, message: str, *, permanent: bool = False) -> None:
        super().__init__(message)
        self.permanent = permanent


class EmailSender(Protocol):
    def send(
        self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str
    ) -> str: ...


def build_message(
    sender: str, reply_to: str, to: list[str], subject: str, text: str, html: str, key: str
) -> EmailMessage:
    """A text + HTML email. The outbox event id goes in the Message-ID, so a resend after a lost
    reply is recognisable."""
    message = EmailMessage()
    message["From"] = sender
    message["To"] = ", ".join(to)
    message["Reply-To"] = reply_to
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=False)
    domain = sender.rsplit("@", 1)[-1].rstrip(">").strip() or None
    message["Message-ID"] = make_msgid(idstring=key.replace("@", "-"), domain=domain)
    message.set_content(text)
    message.add_alternative(html, subtype="html")
    return message


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

    def send(
        self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str
    ) -> str:
        message = build_message(
            self.sender, self.reply_to, to, subject, text, html, idempotency_key
        )
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


# Access tokens by refresh token: a sender is made every dispatcher pass, the token lasts an hour.
_access_tokens: dict[str, tuple[str, float]] = {}
_access_tokens_lock = threading.Lock()


class GmailApiSender:
    """Gmail's API, as the mailbox that approved `python -m app.workers.gmail_authorize` (scope:
    send only). Sends over HTTPS, so it works where SMTP ports are blocked."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        refresh_token: str,
        sender: str,
        reply_to: str,
        timeout: float = 20.0,
    ) -> None:
        self.client_id, self.client_secret, self.refresh_token = (
            client_id,
            client_secret,
            refresh_token,
        )
        self.sender, self.reply_to, self.timeout = sender, reply_to, timeout

    def _access_token(self) -> str:
        with _access_tokens_lock:
            cached = _access_tokens.get(self.refresh_token)
            if cached and cached[1] > time.monotonic() + 60:
                return cached[0]
        try:
            response = httpx.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": self.refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:
            raise EmailError(f"Could not reach Google: {exc.__class__.__name__}") from exc
        if response.status_code >= 400:
            error = _google_error(response)
            if error in ("invalid_grant", "invalid_client", "unauthorized_client"):
                # Not permanent: the email waits until the token is replaced.
                raise EmailError(
                    f"Google refused the Gmail token ({error}): run `python -m "
                    "app.workers.gmail_authorize` again and update GMAIL_REFRESH_TOKEN"
                )
            raise EmailError(f"Google's token service answered {response.status_code}: {error}")
        body = response.json()
        token: str = body["access_token"]
        with _access_tokens_lock:
            _access_tokens[self.refresh_token] = (
                token,
                time.monotonic() + float(body.get("expires_in", 3600)),
            )
        return token

    def send(
        self, *, to: list[str], subject: str, text: str, html: str, idempotency_key: str
    ) -> str:
        message = build_message(
            self.sender, self.reply_to, to, subject, text, html, idempotency_key
        )
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        try:
            response = httpx.post(
                GMAIL_SEND_URL,
                headers={"Authorization": f"Bearer {self._access_token()}"},
                json={"raw": raw},
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:
            raise EmailError(f"Could not reach Gmail: {exc.__class__.__name__}") from exc
        if response.status_code == 401:
            with _access_tokens_lock:
                _access_tokens.pop(self.refresh_token, None)
            raise EmailError("Gmail refused the access token; a new one is fetched on the retry")
        if response.status_code >= 400:
            # 400: a bad address or message. 403/429/5xx: limits or Google trouble, retried.
            raise EmailError(
                f"Gmail answered {response.status_code}: {response.text[:300]}",
                permanent=response.status_code == 400,
            )
        gmail_id: str = response.json().get("id", "")
        return gmail_id


def _google_error(response: httpx.Response) -> str:
    try:
        return str(response.json().get("error", response.text[:200]))
    except ValueError:
        return response.text[:200]


def get_email_sender() -> EmailSender | None:
    """The Gmail API when its three settings are set, else SMTP when SMTP_HOST is set, else
    Resend when RESEND_API_KEY is set, else None (emails then wait in the outbox)."""
    settings = get_settings()
    if settings.gmail_client_id and settings.gmail_client_secret and settings.gmail_refresh_token:
        return GmailApiSender(
            settings.gmail_client_id,
            settings.gmail_client_secret,
            settings.gmail_refresh_token,
            settings.dataqs_email_from,
            settings.dataqs_email_reply_to,
        )
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
