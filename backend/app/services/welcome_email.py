"""The welcome email a client or broker gets when they sign up (password or Google).

Sent after the sign-up answer (a background task), so a slow or failing mail service never delays
or fails the sign-up; a failure is only logged. While DATAQS_EMAIL_CARRIER_OVERRIDE is set
(testing), it goes to those addresses instead, saying who it was meant for.
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from app.core.config import get_settings
from app.models import User
from app.services.dataqs_email import EmailSender
from app.services.dataqs_notifications import render_html
from app.services.subscription import MONTHLY_PRICE

logger = logging.getLogger(__name__)

FOOTER = "Sky Transport Solutions · CarrierSafetyScan"

CLIENT_FEATURES = (
    "- See your carrier's safety scores, inspections and violations, from FMCSA's own records\n"
    "- See what brokers flag when they vet you, and how each item is usually fixed\n"
    "- Ask STS to challenge a wrong inspection through DataQs, and order compliance services"
)
BROKER_FEATURES = (
    "- Search any carrier and see its safety record, authority and insurance from FMCSA\n"
    "- See the red flags broker vetting tools look for\n"
    "- Compare carriers side by side before you book a load"
)


@dataclass(frozen=True)
class WelcomeEmail:
    """Plain values (no database objects), so it can be sent after the request has finished."""

    user_id: int
    to: list[str]
    subject: str
    text: str
    html: str


def welcome_email(user: User, company: str) -> WelcomeEmail:
    settings = get_settings()
    first_name = user.full_name.split()[0] if user.full_name.strip() else "there"
    portal = "/broker" if user.role.is_broker else "/portal"
    link = f"{settings.public_app_url.rstrip('/')}{portal}"
    features = BROKER_FEATURES if user.role.is_broker else CLIENT_FEATURES
    body = (
        f"Hi {first_name},\n\n"
        f"Welcome to CarrierSafetyScan, by Sky Transport Solutions. The account for {company} "
        f"is ready, and you can log in any time with {user.email}.\n\n"
        f"What you can do:\n{features}"
    )
    if user.trial_ends_at is not None:
        body += (
            f"\n\nYour free trial runs until {_date(user.trial_ends_at)}. After that it's "
            f"${MONTHLY_PRICE:.0f} a month to keep using CarrierSafetyScan; cancel anytime."
        )
    body += "\n\nQuestions? Just reply to this email and the STS team will help.\n\nWelcome aboard!"
    to = [user.email]
    if settings.dataqs_carrier_override_list:
        body = f"[Test routing: meant for {user.email}]\n\n{body}"
        to = settings.dataqs_carrier_override_list
    return WelcomeEmail(
        user_id=user.id,
        to=to,
        subject="Welcome to CarrierSafetyScan",
        text=f"{body}\n\n{link}",
        html=render_html(body, link, "Open CarrierSafetyScan", footer=FOOTER),
    )


def send_welcome(email: WelcomeEmail, sender: EmailSender | None) -> None:
    """Never raises: the account exists either way."""
    if sender is None:
        logger.info("No email service: welcome email for user %s not sent", email.user_id)
        return
    try:
        sender.send(
            to=email.to,
            subject=email.subject,
            text=email.text,
            html=email.html,
            idempotency_key=f"welcome-{email.user_id}",
        )
    except Exception:  # noqa: BLE001 - the sign-up has already succeeded
        logger.warning("Welcome email for user %s failed", email.user_id)


def _date(value: datetime) -> str:
    return f"{value:%B} {value.day}, {value.year}"
