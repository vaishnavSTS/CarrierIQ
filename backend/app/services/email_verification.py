"""The "confirm your email" message a password sign-up gets. The free trial starts once they do.

Sent after the answer (a background task); a failure is only logged, and they can ask for another
on the page they land on. The link is never logged. While the test overrides are set
(DATAQS_EMAIL_CARRIER_OVERRIDE), it goes to those addresses instead, saying who it was meant for.
"""

import logging
import secrets
from dataclasses import dataclass

from app.core.config import get_settings
from app.models import User
from app.services.dataqs_email import EmailSender
from app.services.dataqs_notifications import render_html

logger = logging.getLogger(__name__)

FOOTER = "Sky Transport Solutions · CarrierSafetyScan"


@dataclass(frozen=True)
class VerificationEmail:
    """Plain values (no database objects), so it can be sent after the request has finished."""

    user_id: int
    to: list[str]
    subject: str
    text: str
    html: str


def verification_email(user: User, token: str, hours: int) -> VerificationEmail:
    settings = get_settings()
    first_name = user.full_name.split()[0] if user.full_name.strip() else "there"
    # After the #, so the token isn't sent to web servers or kept in their logs.
    link = f"{settings.public_app_url.rstrip('/')}/verify-email#token={token}"
    body = (
        f"Hi {first_name},\n\n"
        f"Please confirm that {user.email} is your email address to finish creating your "
        "CarrierSafetyScan account. Your free trial starts once you do.\n\n"
        f"The link below expires in {hours} hours. If you didn't sign up, you can ignore this "
        "email."
    )
    to = [user.email]
    if settings.dataqs_carrier_override_list:
        body = f"[Test routing: meant for {user.email}]\n\n{body}"
        to = settings.dataqs_carrier_override_list
    return VerificationEmail(
        user_id=user.id,
        to=to,
        subject="Confirm your email for CarrierSafetyScan",
        text=f"{body}\n\n{link}",
        html=render_html(body, link, "Confirm my email", footer=FOOTER),
    )


def send_verification(email: VerificationEmail, sender: EmailSender | None) -> None:
    """Never raises: the account exists either way, and they can ask for another."""
    if sender is None:
        logger.info("No email service: verification for user %s not sent", email.user_id)
        return
    try:
        sender.send(
            to=email.to,
            subject=email.subject,
            text=email.text,
            html=email.html,
            # Every request is a new email.
            idempotency_key=f"email-verify-{email.user_id}-{secrets.token_hex(8)}",
        )
    except Exception:  # noqa: BLE001 - the page has already answered
        logger.warning("Verification email for user %s failed", email.user_id)
