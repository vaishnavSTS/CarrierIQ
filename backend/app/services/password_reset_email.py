"""The "reset your password" email, and a new staff member's "choose your password" invite.

Sent after the answer (a background task), so the forgot-password page takes the same time whether
or not the account exists; a failure is only logged, and the link is never logged. While the test
overrides are set (DATAQS_EMAIL_CARRIER_OVERRIDE / _STAFF_OVERRIDE), it goes to those addresses
instead, saying who it was meant for.
"""

import logging
import secrets
from dataclasses import dataclass

from app.core.config import get_settings
from app.models import User
from app.services.dataqs_email import EmailSender
from app.services.dataqs_notifications import render_html

logger = logging.getLogger(__name__)

FOOTER = "Sky Transport Solutions · Carrier Safety Scan"


@dataclass(frozen=True)
class PasswordResetEmail:
    """Plain values (no database objects), so it can be sent after the request has finished."""

    user_id: int
    to: list[str]
    subject: str
    text: str
    html: str


def password_reset_email(user: User, token: str, minutes: int) -> PasswordResetEmail:
    settings = get_settings()
    first_name = user.full_name.split()[0] if user.full_name.strip() else "there"
    # After the #, so the token isn't sent to web servers or kept in their logs.
    link = f"{settings.public_app_url.rstrip('/')}/reset-password#token={token}"
    body = (
        f"Hi {first_name},\n\n"
        f"We got a request to reset the password for your Carrier Safety Scan account "
        f"({user.email}). Use the link below to choose a new one. It works once and expires in "
        f"{minutes} minutes.\n\n"
        "If you didn't ask for this, you can ignore this email: your password stays the same."
    )
    to = [user.email]
    override = (
        settings.dataqs_staff_override_list
        if user.role.is_staff
        else settings.dataqs_carrier_override_list
    )
    if override:
        body = f"[Test routing: meant for {user.email}]\n\n{body}"
        to = override
    return PasswordResetEmail(
        user_id=user.id,
        to=to,
        subject="Reset your Carrier Safety Scan password",
        text=f"{body}\n\n{link}",
        html=render_html(body, link, "Reset my password", footer=FOOTER),
    )


def staff_invite_email(user: User, token: str, hours: int) -> PasswordResetEmail:
    """A new staff member's welcome: the same "choose a password" link, valid for longer."""
    settings = get_settings()
    first_name = user.full_name.split()[0] if user.full_name.strip() else "there"
    link = f"{settings.public_app_url.rstrip('/')}/reset-password#token={token}"
    body = (
        f"Hi {first_name},\n\n"
        f"Sky Transport Solutions has made you a Carrier Safety Scan staff account ({user.email}). "
        f"Use the link below to choose your password. It works once and expires in {hours} hours; "
        'after that, use "Forgot password?" on the STS team login page.\n\n'
        "You can also sign in with Google using this email address."
    )
    to = [user.email]
    if settings.dataqs_staff_override_list:
        body = f"[Test routing: meant for {user.email}]\n\n{body}"
        to = settings.dataqs_staff_override_list
    return PasswordResetEmail(
        user_id=user.id,
        to=to,
        subject="Your Carrier Safety Scan staff account",
        text=f"{body}\n\n{link}",
        html=render_html(body, link, "Choose my password", footer=FOOTER),
    )


def send_password_reset(email: PasswordResetEmail, sender: EmailSender | None) -> None:
    """Never raises: the page's answer is the same either way."""
    if sender is None:
        logger.info("No email service: password reset for user %s not sent", email.user_id)
        return
    try:
        sender.send(
            to=email.to,
            subject=email.subject,
            text=email.text,
            html=email.html,
            # Every request is a new email, with a new link.
            idempotency_key=f"password-reset-{email.user_id}-{secrets.token_hex(8)}",
        )
    except Exception:  # noqa: BLE001 - the page has already answered
        logger.warning("Password reset email for user %s failed", email.user_id)
