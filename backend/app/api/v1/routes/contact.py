"""The public Contact Us form: emails the visitor's message to STS.

Sent during the request, not after, so the page can say so when it didn't go and give the phone
number instead. Nothing is stored. Goes where service requests go (COMPLIANCE_REQUEST_EMAIL), or
to DATAQS_EMAIL_STAFF_OVERRIDE while that is set.
"""

import logging
import re
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator

from app.api.bot_protection import client_ip, require_human
from app.core.config import get_settings
from app.core.exceptions import ContactUnavailableError
from app.core.rate_limit import limiter
from app.schemas.auth import _email
from app.services.dataqs_email import EmailSender, get_email_sender
from app.services.dataqs_notifications import render_html

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact", tags=["contact"])

MESSAGES_PER_IP = (5, 3600.0)
UNAVAILABLE = (
    "We couldn't send your message. Please call us at (800) 498-9820 "
    "or email info@skytransportsolutions.com."
)


class ContactIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=254)
    phone: str | None = Field(default=None, max_length=30)
    company: str | None = Field(default=None, max_length=200)
    usdot: str | None = Field(default=None, max_length=8, pattern=r"^\d*$")
    message: str = Field(min_length=1, max_length=5000)

    _normalize_email = field_validator("email")(_email)

    @field_validator("full_name", "message")
    @classmethod
    def _required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value


def get_contact_email_sender() -> EmailSender | None:
    """How the message is sent (tests replace it)."""
    return get_email_sender()


def limit_contact(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        limit, window = MESSAGES_PER_IP
        limiter.hit(f"contact-ip:{client_ip(request)}", limit, window)


@router.post("", dependencies=[Depends(limit_contact), Depends(require_human)])
def send_message(
    data: ContactIn,
    sender: Annotated[EmailSender | None, Depends(get_contact_email_sender)],
) -> dict[str, bool]:
    to = get_settings().compliance_request_recipients
    if sender is None or not to:
        raise ContactUnavailableError(UNAVAILABLE)
    # One line, whatever was typed: the name goes in the subject.
    name = re.sub(r"\s+", " ", data.full_name)
    details = [
        f"From: {name}",
        f"Email: {data.email}",
        f"Phone: {data.phone}" if data.phone else "",
        f"Company: {data.company}" if data.company else "",
        f"USDOT: {data.usdot}" if data.usdot else "",
    ]
    body = (
        "New message from the CarrierSafetyScan Contact Us page. Reply to the visitor at the "
        "email above; replying to this email won't reach them.\n\n"
        + "\n".join(line for line in details if line)
        + f"\n\n{data.message}"
    )
    try:
        sender.send(
            to=to,
            subject=f"Contact Us: {name}",
            text=body,
            html=render_html(body, None, "", footer="CarrierSafetyScan Contact Us page"),
            idempotency_key=f"contact-{secrets.token_hex(12)}",
        )
    except Exception as exc:  # noqa: BLE001 - the visitor is told, and given the phone number
        logger.warning("Contact Us email failed: %s", type(exc).__name__)
        raise ContactUnavailableError(UNAVAILABLE) from exc
    return {"ok": True}
