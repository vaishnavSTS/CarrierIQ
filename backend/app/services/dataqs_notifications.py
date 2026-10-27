"""DataQs emails (docs/DataQ.md): to the carrier, and reminders to STS staff.

The workflow STS chose:
- The carrier gives STS the information in the client portal; an STS representative files it in
  FMCSA DataQs on the carrier's behalf.
- STS emails the carrier about anything else needed. Some emails the app writes at key steps
  (STS needs evidence, the package is ready to approve, the request was filed, the agency
  decided, the file is closed); staff also write their own. Each one is kept on the case
  (dataqs_messages) so both sides can see it.
- STS staff get reminders to check the request in DataQs 7 and 21 days after each filing
  (DATAQS_REMINDER_DAYS): to the case specialist, or to STS admins while nobody owns the case.
- And before STS's own deadlines: 7, 3 and 1 days before an answer to an agency information
  request is due (14 days), and 14, 7, 3 and 1 days before the last day to appeal (30 days).
  Each is checked again when it is due: it moves with the deadline (an override), waits while
  the deadline is paused, and is dropped once the deadline is met, stopped or already past.
- When staff close the file, the carrier is told.
- STS is told straight away when the carrier adds a file, sends the case back, approves the
  package or asks for changes: to the case specialist, or STS admins while nobody owns the
  case, decided when it is sent.
- A call the carrier books with STS (dataqs_call_service.py): an email with the calendar
  file, a text now and a text 1 hour before (Twilio; channel SMS), and STS is told.
- While testing, DATAQS_EMAIL_CARRIER_OVERRIDE / DATAQS_EMAIL_STAFF_OVERRIDE send every
  carrier / staff email to set addresses instead, and DATAQS_SMS_OVERRIDE every text to
  one number; each says who it was meant for.

Emails go through an outbox (dataqs_outbox): a row is written in the same transaction as the
change that causes it, with a stable event id, and a dispatcher sends it (now, or at
next_attempt_at for a reminder), retries transient failures and keeps the result. A failed email
never blocks the case. Email is a prompt to look at the case, not a record that something was
filed. When a transaction that queued a carrier email commits, the dispatcher is woken, so the
email goes out within seconds rather than at its next 30-second round.
"""

import html
import logging
import secrets
import threading
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    DataQsCall,
    DataQsCase,
    DataQsClock,
    DataQsEvidence,
    DataQsMessage,
    DataQsOutbox,
    User,
)
from app.models.enums import (
    DataQsCallStatus,
    DataQsClockType,
    DataQsOutboxStatus,
    DataQsWorkStatus,
    UserRole,
    UserStatus,
)
from app.services.dataqs_email import Attachment, EmailError, EmailSender
from app.services.twilio_client import TwilioClient, TwilioError

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
# A text that couldn't go because Twilio isn't configured (no STS number yet).
TEXTS_NOT_SET_UP = "Text messages aren't set up yet (no Twilio number)"

# Set when a carrier email is committed (or to stop): the dispatcher sends now, not in 30 seconds.
_wake = threading.Event()
_QUEUED = "dataqs_email_queued"


def wake_dispatcher() -> None:
    _wake.set()


@event.listens_for(Session, "after_commit")
def _wake_after_commit(session: Session) -> None:
    # After the commit, so the dispatcher's own session can see the new rows.
    if session.info.pop(_QUEUED, False):
        wake_dispatcher()


@event.listens_for(Session, "after_rollback")
def _forget_after_rollback(session: Session) -> None:
    session.info.pop(_QUEUED, None)


REMINDER_PREFIX = "REMINDER_"
# Emails to STS about something the carrier did; the recipients are chosen when sent.
NOTICE_PREFIX = "NOTICE_"
# Reminders before STS's deadlines: days before the due date, and the name used in the kind.
DEADLINE_REMINDERS: dict[DataQsClockType, tuple[str, tuple[int, ...]]] = {
    DataQsClockType.REQUESTER_INFO: ("ANSWER", (7, 3, 1)),
    DataQsClockType.APPEAL: ("APPEAL", (14, 7, 3, 1)),
}


def _now() -> datetime:
    return datetime.now(UTC)


def _day(at: datetime) -> str:
    return f"{at:%b} {at.day}, {at.year}"


def carrier_link(case: DataQsCase) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}/portal/dataqs/cases/{case.id}"


def staff_link(case: DataQsCase) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}/dataqs/cases/{case.id}"


def render_html(text: str, link: str, link_label: str, first: tuple[str, str] | None = None) -> str:
    """The email as HTML; `first` (label, url) is a button before the main one."""
    paragraphs = "".join(
        f"<p>{html.escape(part).replace(chr(10), '<br>')}</p>" for part in text.split("\n\n")
    )
    return (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14121f">'
        f"{paragraphs}"
        + (
            f'<p><a href="{html.escape(first[1])}" style="background:#fff;color:#6d4aff;'
            f'padding:8px 14px;border:1px solid #6d4aff;border-radius:6px;text-decoration:none">'
            f"{html.escape(first[0])}</a></p>"
            if first
            else ""
        )
        + f'<p><a href="{html.escape(link)}" style="background:#6d4aff;color:#fff;padding:8px 14px;'
        f'border-radius:6px;text-decoration:none">{html.escape(link_label)}</a></p>'
        '<p style="color:#6b6880;font-size:12px">Sky Transport Solutions · DataQs service</p>'
        "</div>"
    )


class DataQsNotifications:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Recipients -------------------------------------------------------------------------------

    def carrier_users(self, case: DataQsCase) -> list[User]:
        """Everyone active at the carrier's company (owners and viewers)."""
        return list(
            self.db.scalars(
                select(User)
                .where(
                    User.organization_id == case.organization_id,
                    User.status == UserStatus.ACTIVE,
                    User.role.in_([UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER]),
                )
                .order_by(User.id)
            )
        )

    def staff_for(self, case: DataQsCase) -> list[User]:
        """The case specialist, or every STS admin while nobody owns the case."""
        if case.owner_id is not None:
            owner = self.db.get(User, case.owner_id)
            if owner is not None and owner.status == UserStatus.ACTIVE:
                return [owner]
        return list(
            self.db.scalars(
                select(User).where(
                    User.role == UserRole.STS_ADMIN, User.status == UserStatus.ACTIVE
                )
            )
        )

    # --- Carrier emails ---------------------------------------------------------------------------

    def to_carrier(
        self, case: DataQsCase, kind: str, subject: str, body: str, author: User | None = None
    ) -> DataQsMessage:
        """Keep the message on the case and queue the email (in the caller's transaction)."""
        recipients = self.carrier_users(case)
        override = get_settings().dataqs_carrier_override_list
        message = DataQsMessage(
            case_id=case.id,
            author_id=author.id if author else None,
            kind=kind,
            subject=subject[:200],
            body=body,
            recipients=override or [u.email for u in recipients],
            outbox_event_id="",
        )
        self.db.add(message)
        self.db.flush()
        message.outbox_event_id = f"dataqs-msg-{message.id}"
        text = (
            f"{body}\n\nOpen the case: {carrier_link(case)}\n\nTo reply, answer this email; it "
            "goes to the STS team."
        )
        # One email per carrier user, or (testing) one to the override addresses.
        targets: list[tuple[int, list[str], str]] = [
            (u.id, [u.email], f"u{u.id}") for u in recipients
        ]
        if override:
            meant = ", ".join(u.email for u in recipients) or "no active users"
            text = f"[Test routing: meant for {meant}]\n\n{text}"
            body = f"[Test routing: meant for {meant}]\n\n{body}"
            owner = recipients[0].id if recipients else case.created_by_id
            targets = [(owner, override, "override")]
        for recipient_id, to, suffix in targets:
            self.db.add(
                DataQsOutbox(
                    event_id=f"{message.outbox_event_id}-{suffix}",
                    case_id=case.id,
                    recipient_id=recipient_id,
                    channel="EMAIL",
                    kind=kind,
                    payload={
                        "to": to,
                        "subject": message.subject,
                        "text": text,
                        "html": render_html(body, carrier_link(case), "Open the case"),
                        "message_id": message.id,
                    },
                )
            )
        self.db.flush()
        self.db.info[_QUEUED] = True
        return message

    # --- Emails to STS about the carrier ----------------------------------------------------------

    def to_staff(
        self,
        case: DataQsCase,
        kind: str,
        subject: str,
        body: str,
        calendar: tuple[str, bytes] | None = None,
    ) -> None:
        """Tell STS that the carrier did something (in the caller's transaction)."""
        staff = self.staff_for(case)
        if not staff:
            logger.warning("DataQs case %s: no STS staff to tell", case.id)
            return
        self.db.add(
            DataQsOutbox(
                event_id=f"dataqs-case-{case.id}-{kind.lower()}-{secrets.token_hex(6)}",
                case_id=case.id,
                recipient_id=staff[0].id,  # re-chosen when sent: the owner may change
                channel="EMAIL",
                kind=f"{NOTICE_PREFIX}{kind}",
                payload={"subject": subject[:200], "body": body, **_calendar(calendar)},
            )
        )
        self.db.flush()
        self.db.info[_QUEUED] = True

    def to_people(
        self,
        case: DataQsCase,
        people: list[User],
        kind: str,
        subject: str,
        body: str,
        calendar: tuple[str, bytes] | None = None,
        first: tuple[str, str] | None = None,
    ) -> None:
        """An email to some of the carrier's users only (e.g. who booked a call), not kept as
        a case message; with an optional calendar file (name, .ics bytes)."""
        override = get_settings().dataqs_carrier_override_list
        text = f"{body}\n\nOpen the case: {carrier_link(case)}"
        targets = [(u.id, [u.email], f"u{u.id}") for u in people]
        if override:
            meant = ", ".join(u.email for u in people) or "no active users"
            text = f"[Test routing: meant for {meant}]\n\n{text}"
            body = f"[Test routing: meant for {meant}]\n\n{body}"
            owner = people[0].id if people else case.created_by_id
            targets = [(owner, override, "override")]
        token = secrets.token_hex(6)
        for recipient_id, to, suffix in targets:
            self.db.add(
                DataQsOutbox(
                    event_id=f"dataqs-case-{case.id}-{kind.lower()}-{token}-{suffix}",
                    case_id=case.id,
                    recipient_id=recipient_id,
                    channel="EMAIL",
                    kind=kind,
                    payload={
                        "to": to,
                        "subject": subject[:200],
                        "text": text,
                        "html": render_html(body, carrier_link(case), "Open the case", first),
                        **_calendar(calendar),
                    },
                )
            )
        self.db.flush()
        self.db.info[_QUEUED] = True

    def text(
        self,
        case: DataQsCase,
        recipient_id: int,
        kind: str,
        phone: str,
        body: str,
        *,
        at: datetime | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        """A text message to the carrier (Twilio), now or at `at`."""
        override = get_settings().dataqs_sms_override
        if override:
            body = f"[Test: meant for {phone}] {body}"
        self.db.add(
            DataQsOutbox(
                event_id=f"dataqs-case-{case.id}-{kind.lower()}-{secrets.token_hex(6)}",
                case_id=case.id,
                recipient_id=recipient_id,
                channel="SMS",
                kind=kind,
                payload={"to": [override or phone], "body": body, **(extra or {})},
                next_attempt_at=at,
            )
        )
        self.db.flush()
        self.db.info[_QUEUED] = True

    def evidence_added(
        self, case: DataQsCase, evidence: DataQsEvidence, uploader: User, relevance: str
    ) -> None:
        """The carrier added a file: STS is emailed straight away, one email per file."""
        carrier = case.source_snapshot.get("carrier_name") or f"USDOT {case.usdot_number}"
        name = evidence.title or evidence.file_name
        body = (
            f"{uploader.full_name} ({carrier}) added a file to DataQs case {case.id}:\n\n"
            f"{name}"
            + (f" ({evidence.file_name})" if evidence.title else "")
            + (f"\nHow it supports the issue: {relevance}" if relevance else "")
            + "\n\nReview it. If the request package needs it, revise the package and ask "
            "the carrier to approve it again."
        )
        self.to_staff(
            case, "EVIDENCE_ADDED", f"New evidence from the carrier: DataQs case {case.id}", body
        )

    def _notice(self, row: DataQsOutbox, case: DataQsCase) -> dict[str, Any] | None:
        """A notice as it should read now (None: nothing left to tell)."""
        staff = self.staff_for(case)
        if not staff:
            return None
        subject, body = row.payload["subject"], row.payload["body"]
        override = get_settings().dataqs_staff_override_list
        if override:
            body = f"[Test routing: meant for {', '.join(u.email for u in staff)}]\n\n{body}"
        return {
            "to": override or [u.email for u in staff],
            "subject": subject,
            "text": f"{body}\n\nOpen the case: {staff_link(case)}",
            "html": render_html(body, staff_link(case), "Open the case"),
            **{k: row.payload[k] for k in ("ics", "ics_name") if k in row.payload},
        }

    # --- Staff reminders --------------------------------------------------------------------------

    def schedule_filing_reminders(
        self, case: DataQsCase, attempt_id: int, filed_at: datetime
    ) -> None:
        nominal = self.staff_for(case)
        if not nominal:
            logger.warning("DataQs case %s: no STS staff to remind", case.id)
            return
        for days in get_settings().dataqs_reminder_day_list:
            self.db.add(
                DataQsOutbox(
                    event_id=f"dataqs-case-{case.id}-attempt-{attempt_id}-reminder-{days}d",
                    case_id=case.id,
                    recipient_id=nominal[0].id,  # re-chosen when sent: the owner may change
                    channel="EMAIL",
                    kind=f"{REMINDER_PREFIX}{days}_DAYS",
                    payload={"days": days, "filed_at": filed_at.isoformat()},
                    next_attempt_at=filed_at + timedelta(days=days),
                )
            )
        self.db.flush()

    def schedule_deadline_reminders(self, case: DataQsCase, clock: DataQsClock) -> None:
        """Reminders to STS before an answer to the agency or an appeal is due. Ones whose time has
        already passed when the deadline starts (e.g. a decision recorded late) are skipped."""
        plan = DEADLINE_REMINDERS.get(clock.clock_type)
        if plan is None or clock.due_at is None:
            return
        staff = self.staff_for(case)
        if not staff:
            logger.warning("DataQs case %s: no STS staff to remind", case.id)
            return
        name, days_before = plan
        now = _now()
        for days in days_before:
            at = clock.due_at - timedelta(days=days)
            if at <= now:
                continue
            self.db.add(
                DataQsOutbox(
                    event_id=f"dataqs-clock-{clock.id}-reminder-{days}d-left",
                    case_id=case.id,
                    recipient_id=staff[0].id,  # re-chosen when sent: the owner may change
                    channel="EMAIL",
                    kind=f"{REMINDER_PREFIX}{name}_{days}_DAYS_LEFT",
                    payload={"clock_id": clock.id, "days_before": days},
                    next_attempt_at=at,
                )
            )
        self.db.flush()

    def cancel_pending(self, case: DataQsCase, kinds: Iterable[str] | None = None) -> int:
        """Reminders no longer needed (the case closed). Carrier emails already queued still go."""
        count = 0
        for row in self.db.scalars(
            select(DataQsOutbox).where(
                DataQsOutbox.case_id == case.id,
                DataQsOutbox.status == DataQsOutboxStatus.PENDING,
            )
        ):
            wanted = kinds is None and row.kind.startswith(REMINDER_PREFIX)
            if wanted or (kinds is not None and row.kind in set(kinds)):
                row.status = DataQsOutboxStatus.CANCELLED
                count += 1
        return count

    def _reminder(
        self, row: DataQsOutbox, case: DataQsCase, now: datetime
    ) -> dict[str, Any] | datetime | None:
        """The reminder as it should read now; None when it is no longer needed; or, for a
        deadline that moved, when it should go instead."""
        if case.work_status == DataQsWorkStatus.CLOSED:
            return None
        staff = self.staff_for(case)
        if not staff:
            return None
        if "clock_id" in row.payload:
            return self._deadline_reminder(row, case, staff, now)
        days = int(row.payload.get("days", 0))
        request = case.gov_request_id or f"case {case.id}"
        carrier = case.source_snapshot.get("carrier_name") or f"USDOT {case.usdot_number}"
        what = (
            "The agency should have opened it by now (agencies open requests within 7 days). "
            "Look for the 'Opened' event, any questions and new messages."
            if days < 21
            else "An initial decision is due about now (21 days for an initial review). Look for "
            "a decision, questions or new messages."
        )
        body = (
            f"It has been {days} days since DataQs request {request} for {carrier} was filed.\n\n"
            f"{what}\n\nRecord anything new on the case in CarrierSafetyScan (Record an agency "
            "event)."
        )
        override = get_settings().dataqs_staff_override_list
        if override:
            meant = ", ".join(u.email for u in staff)
            body = f"[Test routing: meant for {meant}]\n\n{body}"
        return {
            "to": override or [u.email for u in staff],
            "subject": f"Check DataQs request {request} ({days} days since filing)",
            "text": f"{body}\n\nOpen the case: {staff_link(case)}",
            "html": render_html(body, staff_link(case), "Open the case"),
        }

    def _deadline_reminder(
        self, row: DataQsOutbox, case: DataQsCase, staff: list[User], now: datetime
    ) -> dict[str, Any] | datetime | None:
        clock = self.db.get(DataQsClock, int(row.payload["clock_id"]))
        if clock is None or not clock.is_active:
            return None  # answered, appealed, or stopped
        if clock.due_at is None:
            return now + timedelta(days=1)  # paused: look again tomorrow
        days_before = int(row.payload["days_before"])
        planned = clock.due_at - timedelta(days=days_before)
        if planned > now + timedelta(minutes=5):
            return planned  # the deadline moved later
        if clock.due_at <= now:
            return None  # already past; the supervisor view shows it
        closer = [d for d in DEADLINE_REMINDERS[clock.clock_type][1] if d < days_before]
        if any(clock.due_at - timedelta(days=d) <= now for d in closer):
            return None  # a more urgent reminder is due too (e.g. after downtime): send only that
        left = clock.due_at - now
        when = (
            "today"
            if left < timedelta(days=1)
            else f"in {left.days + (1 if left.seconds else 0)} days"
        )
        request = case.gov_request_id or f"case {case.id}"
        carrier = case.source_snapshot.get("carrier_name") or f"USDOT {case.usdot_number}"
        due = _day(clock.due_at)
        if clock.clock_type == DataQsClockType.REQUESTER_INFO:
            subject = f"Answer the agency by {due}: DataQs request {request}"
            what = (
                f"The agency asked for more information on DataQs request {request} for "
                f"{carrier} on {_day(clock.base_at)}. The answer is due {when}, by {due} "
                "(14 days).\n\nAnswer in DataQs with Add Response / Documents, then record it on "
                "the case (Record an agency event) so the agency's review time starts again."
            )
        else:
            subject = f"Appeal deadline {due}: DataQs request {request}"
            what = (
                f"The decision on DataQs request {request} for {carrier} was issued on "
                f"{_day(clock.base_at)}. The last day to ask for it to be reviewed again "
                f"(Re-open Request in DataQs) is {due}, {when}.\n\nIf STS will not appeal, close "
                "the file so the carrier is told."
            )
        override = get_settings().dataqs_staff_override_list
        if override:
            meant = ", ".join(u.email for u in staff)
            what = f"[Test routing: meant for {meant}]\n\n{what}"
        return {
            "to": override or [u.email for u in staff],
            "subject": subject,
            "text": f"{what}\n\nOpen the case: {staff_link(case)}",
            "html": render_html(what, staff_link(case), "Open the case"),
        }

    # --- Delivery ---------------------------------------------------------------------------------

    def deliver_due(
        self,
        sender: EmailSender,
        now: datetime | None = None,
        limit: int = 50,
        sms: TwilioClient | None = None,
    ) -> int:
        """Send what is due. Rows are locked one at a time, so two dispatchers never send the
        same email. Returns how many were sent."""
        now = now or _now()
        sent = 0
        for _ in range(limit):
            row = self.db.scalar(
                select(DataQsOutbox)
                .where(
                    DataQsOutbox.status == DataQsOutboxStatus.PENDING,
                    (DataQsOutbox.next_attempt_at.is_(None))
                    | (DataQsOutbox.next_attempt_at <= now),
                )
                .order_by(DataQsOutbox.id)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            if row is None:
                break
            if row.channel == "SMS":
                if self._deliver_text(row, sms, now):
                    sent += 1
            elif self._deliver(row, sender, now):
                sent += 1
            self.db.commit()
        return sent

    def _deliver(self, row: DataQsOutbox, sender: EmailSender, now: datetime) -> bool:
        case = self.db.get(DataQsCase, row.case_id)
        email: dict[str, Any] | None = row.payload
        if case is not None and row.kind.startswith(REMINDER_PREFIX):
            built = self._reminder(row, case, now)
            if isinstance(built, datetime):
                row.next_attempt_at = built  # not yet: the deadline moved or is paused
                return False
            email = built
        elif case is not None and row.kind.startswith(NOTICE_PREFIX):
            email = self._notice(row, case)
        if case is None or email is None or not email.get("to"):
            row.status = DataQsOutboxStatus.CANCELLED
            return False
        row.attempts += 1
        # Only emails with a file pass `attachments`, so senders without it still work.
        files = (
            {
                "attachments": [
                    Attachment(
                        email.get("ics_name") or "call.ics",
                        "text/calendar",
                        str(email["ics"]).encode("utf-8"),
                    )
                ]
            }
            if email.get("ics")
            else {}
        )
        try:
            sender.send(
                to=list(email["to"]),
                subject=email["subject"],
                text=email["text"],
                html=email["html"],
                idempotency_key=row.event_id,
                **files,
            )
        except EmailError as exc:
            row.last_error = str(exc)[:1000]
            if exc.permanent or row.attempts >= MAX_ATTEMPTS:
                row.status = DataQsOutboxStatus.FAILED
            else:
                row.next_attempt_at = now + timedelta(minutes=2**row.attempts)
            logger.warning("DataQs email %s not sent: %s", row.event_id, exc)
            return False
        row.status, row.sent_at, row.last_error = DataQsOutboxStatus.SENT, now, None
        if row.kind.startswith((REMINDER_PREFIX, NOTICE_PREFIX)):
            row.payload = {**row.payload, "sent_to": email["to"]}
        return True

    def _deliver_text(self, row: DataQsOutbox, sms: TwilioClient | None, now: datetime) -> bool:
        """A text message. A call reminder is dropped if the call was moved or cancelled."""
        if row.payload.get("call_id") is not None:
            call = self.db.get(DataQsCall, row.payload["call_id"])
            if (
                call is None
                or call.status != DataQsCallStatus.BOOKED
                or call.starts_at.isoformat() != row.payload.get("starts_at")
            ):
                row.status = DataQsOutboxStatus.CANCELLED
                return False
        if sms is None:
            row.status = DataQsOutboxStatus.FAILED
            row.last_error = TEXTS_NOT_SET_UP
            return False
        row.attempts += 1
        try:
            sid = sms.send_sms(row.payload["to"][0], row.payload["body"])
        except TwilioError as exc:
            row.last_error = str(exc)[:1000]
            if row.attempts >= MAX_ATTEMPTS:
                row.status = DataQsOutboxStatus.FAILED
            else:
                row.next_attempt_at = now + timedelta(minutes=2**row.attempts)
            logger.warning("DataQs text %s not sent: %s", row.event_id, exc)
            return False
        row.status, row.sent_at, row.last_error = DataQsOutboxStatus.SENT, now, None
        row.payload = {**row.payload, "sid": sid}
        return True


def _calendar(calendar: tuple[str, bytes] | None) -> dict[str, str]:
    """A calendar file kept on the outbox row (JSON), sent as an attachment."""
    if calendar is None:
        return {}
    return {"ics_name": calendar[0], "ics": calendar[1].decode("utf-8")}


# --- Dispatcher -----------------------------------------------------------------------------------


def run_dispatcher(stop: threading.Event, interval_seconds: float = 30.0) -> None:
    """Send due DataQs emails until `stop` is set (a thread of the API process): every
    `interval_seconds`, and as soon as a carrier email is committed (wake_dispatcher)."""
    from app.db.session import SessionLocal
    from app.services.dataqs_email import get_email_sender

    while not stop.is_set():
        sender = get_email_sender()
        if sender is not None:
            try:
                with SessionLocal() as db:
                    DataQsNotifications(db).deliver_due(sender, sms=TwilioClient.from_settings())
            except Exception:  # keep the dispatcher alive; the next round retries
                logger.exception("DataQs email dispatch failed")
        # Cleared after waking and before the next round: an email committed meanwhile is
        # either seen by that round or wakes the wait after it.
        _wake.wait(interval_seconds)
        _wake.clear()
