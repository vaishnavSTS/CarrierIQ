"""Insurance renewal reminders: emails before the estimated end of each policy on file.

FMCSA records when a filing took effect, not when the policy expires, so the end date is an
estimate: one calendar year after the effective date (Feb 29 ends Feb 28 in a year without one).
It moves on a year only when FMCSA's data (the filing's `status_as_of`) still showed the filing on
file after that end date, i.e. it renewed. Data that stops before the end date (the old L&I system,
frozen May 14, 2026) can't show a renewal, so a passed end date stays passed and gets no reminder.
The Insurance tab shows the same date (frontend insuranceEnd.ts).

Who gets them: the active users of client organizations linked to the carrier (their account
email), and, with INSURANCE_REMINDERS_CENSUS_EMAIL on, carriers on the Admin Monitored DOTs list at
the email on their MCS-150. One email per reminder stage (INSURANCE_REMINDER_DAYS, e.g. 30 and 7
days before), each sent once per policy year and recorded in `insurance_reminders`; a recipient
who unsubscribed is skipped. Liability (BI&PD) and cargo only: bonds and trust funds have no
yearly term. A filing whose filed cancellation comes first is left alone.

Runs from the worker's scheduling round; a failed send is retried in the next round.
"""

import hashlib
import hmac
import logging
import re
from calendar import monthrange
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.company_census import CompanyCensusAdapter
from app.models import (
    Carrier,
    Insurance,
    InsuranceReminder,
    InsuranceReminderOptOut,
    MonitoredCarrier,
    Organization,
    OrganizationCarrier,
    User,
)
from app.models.enums import OrganizationKind, UserRole, UserStatus
from app.repositories.raw_record_repository import RawRecordRepository
from app.services.dataqs_email import EmailSender
from app.services.dataqs_notifications import render_html

logger = logging.getLogger(__name__)

REMINDED_TYPES = ("BIPD", "CARGO")
TYPE_LABEL = {"BIPD": "Liability insurance (BI&PD)", "CARGO": "Cargo insurance"}
CLIENT = "CLIENT"
CENSUS = "CENSUS"
FOOTER = "Sky Transport Solutions · Carrier Safety Scan"
STS_PHONE = "(800) 498-9820"
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_HASH = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class PolicyEnd:
    date: date
    days_left: int


def _same_date_later(start: date, years: int) -> date:
    year = start.year + years
    return date(year, start.month, min(start.day, monthrange(year, start.month)[1]))


def policy_end(effective: date, today: date, as_of: date | None = None) -> PolicyEnd:
    """One calendar year after `effective`, rolled on a year at a time only past end dates the
    data (as of `as_of`, default today) saw the filing outlive. `days_left` < 0: passed, and the
    data can't show a renewal."""
    seen = min(as_of, today) if as_of else today
    years = 1
    end = _same_date_later(effective, years)
    while end < seen:
        years += 1
        end = _same_date_later(effective, years)
    return PolicyEnd(end, (end - today).days)


def stage_for(days_left: int, stages: Sequence[int]) -> int | None:
    """The reminder due now: the smallest stage the end date is within (30 days left -> 30,
    5 days left -> 7), or None when it is further off than every stage."""
    due = [s for s in stages if 0 <= days_left <= s]
    return min(due) if due else None


def email_hash(email: str) -> str:
    """A keyed hash of the address: the unsubscribe link carries this, never the address."""
    key = get_settings().auth_secret_key.encode()
    message = f"insurance-reminder:{email.strip().lower()}".encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def unsubscribe_url(email: str) -> str:
    base = get_settings().public_app_url.rstrip("/")
    return f"{base}/api/v1/insurance-reminders/unsubscribe?t={email_hash(email)}"


def opt_out(db: Session, token: str) -> bool:
    """Records an unsubscribe from the link's token; False for a malformed token."""
    if not _HASH.match(token):
        return False
    db.execute(
        insert(InsuranceReminderOptOut)
        .values(email_hash=token)
        .on_conflict_do_nothing(index_elements=[InsuranceReminderOptOut.email_hash])
    )
    db.commit()
    return True


@dataclass(frozen=True)
class Recipient:
    email: str
    source: str  # CLIENT | CENSUS


def recipients(db: Session, census_email: bool) -> dict[int, list[Recipient]]:
    """USDOT -> who to remind: client users first, then the MCS-150 email."""
    found: dict[int, dict[str, Recipient]] = defaultdict(dict)
    rows = db.execute(
        select(OrganizationCarrier.usdot_number, User.email)
        .join(Organization, Organization.id == OrganizationCarrier.organization_id)
        .join(User, User.organization_id == Organization.id)
        .where(
            Organization.kind == OrganizationKind.CLIENT,
            User.status == UserStatus.ACTIVE,
            User.role.in_([UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER]),
        )
    )
    for usdot, email in rows:
        found[usdot].setdefault(email.strip().lower(), Recipient(email.strip(), CLIENT))
    if census_email:
        monitored = list(db.scalars(select(MonitoredCarrier.usdot_number)))
        census = RawRecordRepository(db).latest_many(
            CompanyCensusAdapter.source,
            get_settings().census_dataset_id,
            [str(u) for u in monitored],
        )
        for usdot in monitored:
            record = census.get(str(usdot))
            email = str((record.payload if record else {}).get("email_address") or "").strip()
            if _EMAIL.match(email):
                found[usdot].setdefault(email.lower(), Recipient(email, CENSUS))
    return {usdot: list(by_email.values()) for usdot, by_email in found.items()}


@dataclass(frozen=True)
class Due:
    filing: Insurance
    carrier: Carrier
    end: PolicyEnd
    stage: int


def due_filings(
    db: Session, usdot_numbers: Sequence[int], today: date, stages: Sequence[int]
) -> list[Due]:
    """Liability and cargo filings on file whose estimated end is within a reminder stage."""
    if not usdot_numbers or not stages:
        return []
    rows = db.execute(
        select(Insurance, Carrier)
        .join(Carrier, Carrier.id == Insurance.carrier_id)
        .where(
            Carrier.usdot_number.in_(usdot_numbers),
            Insurance.on_file.is_(True),
            Insurance.insurance_type.in_(REMINDED_TYPES),
            Insurance.effective_date.is_not(None),
        )
    )
    due = []
    for filing, carrier in rows.tuples():
        assert filing.effective_date is not None
        end = policy_end(filing.effective_date, today, filing.status_as_of)
        # A filed cancellation that takes effect first ends the coverage; that's its own alert.
        if filing.termination_date is not None and filing.termination_date < end.date:
            continue
        stage = stage_for(end.days_left, stages)
        if stage is not None:
            due.append(Due(filing, carrier, end, stage))
    return due


def _date(value: date) -> str:
    return f"{value:%B} {value.day}, {value.year}"


def _money(value: object) -> str:
    try:
        return f"${float(str(value)):,.0f}"
    except (TypeError, ValueError):
        return ""


@dataclass(frozen=True)
class ReminderEmail:
    to: list[str]
    subject: str
    text: str
    html: str


def reminder_email(due: Due, recipient: Recipient, today: date) -> ReminderEmail:
    settings = get_settings()
    f, carrier = due.filing, due.carrier
    docket = f"{f.docket_prefix.value if f.docket_prefix else ''}{f.docket_number or ''}"
    policy = ", ".join(
        part
        for part in (
            f.insurer,
            f"policy {f.policy_number}" if f.policy_number else "",
            _money(f.coverage_amount),
        )
        if part
    )
    when = (
        "today"
        if due.end.days_left == 0
        else f"in {due.end.days_left} day{'s' if due.end.days_left != 1 else ''}"
    )
    body = (
        f"Hello,\n\n"
        f"FMCSA's records show this insurance on file for {carrier.legal_name} "
        f"(USDOT {carrier.usdot_number}{f', {docket}' if docket else ''}):\n\n"
        f"{TYPE_LABEL.get(f.insurance_type or '', 'Insurance')}: {policy or 'on file'}, "
        f"in effect since {_date(f.effective_date or today)}.\n\n"
        f"Based on a one-year policy term, it is due for renewal around {_date(due.end.date)} "
        f"({when}). FMCSA doesn't publish policy expiry dates, so please check the date on your "
        f"certificate of insurance.\n\n"
        f"If the policy ends and no replacement is filed with FMCSA, FMCSA can revoke your "
        f"operating authority. Sky Transport Solutions can help you renew or compare quotes: "
        f"call {STS_PHONE} or reply to this email."
    )
    app = settings.public_app_url.rstrip("/")
    link = (
        f"{app}/portal"
        if recipient.source == CLIENT
        else f"{app}/contact?usdot={carrier.usdot_number}&topic=Insurance%20renewal"
    )
    label = "Open Carrier Safety Scan" if recipient.source == CLIENT else "Contact STS"
    to = [recipient.email]
    if settings.dataqs_carrier_override_list:
        body = f"[Test routing: meant for {recipient.email}]\n\n{body}"
        to = settings.dataqs_carrier_override_list
    unsubscribe = unsubscribe_url(recipient.email)
    html = render_html(body, link, label, footer=FOOTER)
    closing = "</div>"
    assert html.endswith(closing)
    html = (
        html[: -len(closing)]
        + '<p style="color:#6b6880;font-size:12px">Don\'t want these reminders? '
        + f'<a href="{unsubscribe}" style="color:#6b6880">Unsubscribe</a></p>'
        + closing
    )
    return ReminderEmail(
        to=to,
        subject=f"Insurance renewal coming up for {carrier.legal_name}",
        text=f"{body}\n\n{link}\n\nUnsubscribe from these reminders: {unsubscribe}",
        html=html,
    )


@dataclass(frozen=True)
class SentReminder:
    usdot_number: int
    legal_name: str
    recipient: str
    end_date: date
    days_before: int


def send_due_reminders(
    db: Session, sender: EmailSender | None, today: date | None = None
) -> list[SentReminder]:
    """Sends every reminder due now and not yet sent; returns what was sent."""
    settings = get_settings()
    if not settings.insurance_reminders_enabled:
        return []
    if sender is None:
        logger.info("No email service: insurance reminders not sent")
        return []
    today = today or datetime.now(UTC).date()
    who = recipients(db, settings.insurance_reminders_census_email)
    opted_out = set(db.scalars(select(InsuranceReminderOptOut.email_hash)))
    sent: list[SentReminder] = []
    for due in due_filings(db, list(who), today, settings.insurance_reminder_stages):
        for recipient in who[due.carrier.usdot_number]:
            if email_hash(recipient.email) in opted_out:
                continue
            key = (due.filing.id, due.end.date, due.stage, recipient.email.lower())
            already = db.scalar(
                select(InsuranceReminder.id).where(
                    InsuranceReminder.insurance_id == key[0],
                    InsuranceReminder.end_date == key[1],
                    InsuranceReminder.days_before == key[2],
                    InsuranceReminder.recipient == key[3],
                )
            )
            if already is not None:
                continue
            email = reminder_email(due, recipient, today)
            try:
                sender.send(
                    to=email.to,
                    subject=email.subject,
                    text=email.text,
                    html=email.html,
                    idempotency_key=f"insurance-reminder-{key[0]}-{key[1]}-{key[2]}-{key[3]}",
                )
            except Exception:  # noqa: BLE001 - retried in the next round
                logger.warning(
                    "Insurance reminder for USDOT %s (filing %s) failed",
                    due.carrier.usdot_number,
                    due.filing.id,
                )
                continue
            db.add(
                InsuranceReminder(
                    insurance_id=key[0],
                    usdot_number=due.carrier.usdot_number,
                    end_date=key[1],
                    days_before=key[2],
                    recipient=key[3],
                    source=recipient.source,
                )
            )
            db.commit()
            sent.append(
                SentReminder(
                    due.carrier.usdot_number,
                    due.carrier.legal_name,
                    recipient.email,
                    due.end.date,
                    due.stage,
                )
            )
    if sent:
        logger.info("Sent %d insurance renewal reminders", len(sent))
        _send_summary(sender, sent)
    return sent


def _send_summary(sender: EmailSender, sent: list[SentReminder]) -> None:
    """One email to STS listing this round's reminders (INSURANCE_REMINDERS_COPY_TO)."""
    settings = get_settings()
    to = settings.dataqs_staff_override_list or settings.insurance_reminders_copy_list
    if not to:
        return
    lines = "\n".join(
        f"- {s.legal_name} (USDOT {s.usdot_number}): ends around {_date(s.end_date)}, "
        f"{s.days_before}-day reminder to {s.recipient}"
        for s in sent
    )
    body = f"Insurance renewal reminders sent just now:\n\n{lines}"
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    try:
        sender.send(
            to=to,
            subject=f"{len(sent)} insurance renewal reminder{'s' if len(sent) != 1 else ''} sent",
            text=body,
            html=render_html(body, None, "", footer=FOOTER),
            idempotency_key=f"insurance-reminder-summary-{stamp}",
        )
    except Exception:  # noqa: BLE001 - the reminders themselves went out
        logger.warning("Insurance reminder summary for STS failed")
