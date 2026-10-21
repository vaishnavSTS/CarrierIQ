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
- When staff close the file, the carrier is told.
- While testing, DATAQS_EMAIL_CARRIER_OVERRIDE / DATAQS_EMAIL_STAFF_OVERRIDE send every
  carrier / staff email to set addresses instead; each says who it was meant for.

Emails go through an outbox (dataqs_outbox): a row is written in the same transaction as the
change that causes it, with a stable event id, and a dispatcher sends it (now, or at
next_attempt_at for a reminder), retries transient failures and keeps the result. A failed email
never blocks the case. Email is a prompt to look at the case, not a record that something was
filed.
"""

import html
import logging
import threading
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import DataQsCase, DataQsMessage, DataQsOutbox, User
from app.models.enums import DataQsOutboxStatus, DataQsWorkStatus, UserRole, UserStatus
from app.services.dataqs_email import EmailError, EmailSender

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
REMINDER_PREFIX = "REMINDER_"


def _now() -> datetime:
    return datetime.now(UTC)


def carrier_link(case: DataQsCase) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}/portal/dataqs/cases/{case.id}"


def staff_link(case: DataQsCase) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}/dataqs/cases/{case.id}"


def render_html(text: str, link: str, link_label: str) -> str:
    paragraphs = "".join(
        f"<p>{html.escape(part).replace(chr(10), '<br>')}</p>" for part in text.split("\n\n")
    )
    return (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14121f">'
        f"{paragraphs}"
        f'<p><a href="{html.escape(link)}" style="background:#6d4aff;color:#fff;padding:8px 14px;'
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
        return message

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

    def _reminder(self, row: DataQsOutbox, case: DataQsCase) -> dict[str, Any] | None:
        """The reminder as it should read now, or None when it is no longer needed."""
        if case.work_status == DataQsWorkStatus.CLOSED:
            return None
        staff = self.staff_for(case)
        if not staff:
            return None
        days = int(row.payload.get("days", 0))
        request = case.gov_request_id or f"case #{case.id}"
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

    # --- Delivery ---------------------------------------------------------------------------------

    def deliver_due(self, sender: EmailSender, now: datetime | None = None, limit: int = 50) -> int:
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
            if self._deliver(row, sender, now):
                sent += 1
            self.db.commit()
        return sent

    def _deliver(self, row: DataQsOutbox, sender: EmailSender, now: datetime) -> bool:
        case = self.db.get(DataQsCase, row.case_id)
        email = (
            self._reminder(row, case)
            if row.kind.startswith(REMINDER_PREFIX) and case
            else row.payload
        )
        if case is None or email is None or not email.get("to"):
            row.status = DataQsOutboxStatus.CANCELLED
            return False
        row.attempts += 1
        try:
            sender.send(
                to=list(email["to"]),
                subject=email["subject"],
                text=email["text"],
                html=email["html"],
                idempotency_key=row.event_id,
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
        if row.kind.startswith(REMINDER_PREFIX):
            row.payload = {**row.payload, "sent_to": email["to"]}
        return True


# --- Dispatcher -----------------------------------------------------------------------------------


def run_dispatcher(stop: threading.Event, interval_seconds: float = 30.0) -> None:
    """Send due DataQs emails until `stop` is set (a thread of the API process)."""
    from app.db.session import SessionLocal
    from app.services.dataqs_email import get_email_sender

    while not stop.is_set():
        sender = get_email_sender()
        if sender is not None:
            try:
                with SessionLocal() as db:
                    DataQsNotifications(db).deliver_due(sender)
            except Exception:  # keep the dispatcher alive; the next round retries
                logger.exception("DataQs email dispatch failed")
        stop.wait(interval_seconds)
