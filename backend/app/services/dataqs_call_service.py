"""Calls the carrier books with their STS specialist about a DataQs case (questions about the
request, the evidence, the decision). Not for FMCSA login codes: that is dataqs_otp_service.py.

Rules:
- The carrier's account owner, or STS staff for them, books a call on an open case: a time at
  least 30 minutes ahead and at most 90 days ahead, a US phone number, and an optional topic.
  One booked call per case at a time; booking again moves it.
- Booking, moving and cancelling each send, through the outbox:
  - an email to the person who booked (STS booking: the carrier's users) with the call as a
    calendar file (.ics, with a reminder 30 minutes before) and an "Add to Google Calendar"
    button. It isn't an invitation: they add it to their own calendar;
  - a text message now, and a text 1 hour before the call (dropped if the call is moved or
    cancelled, or if it is booked less than an hour ahead);
  - when the carrier did it, an email to STS (the case specialist, or STS admins) with the
    same calendar file.
- STS gets a "Call the carrier" task due at the call's time, done when the call is marked held or
  cancelled.
"""

import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import (
    DataQsInvalidTransitionError,
    DataQsMissingAuthorityError,
    NotFoundError,
    ValidationError,
)
from app.models import DataQsCall, DataQsCase, User
from app.models.enums import DataQsActionOwner, DataQsCallStatus, DataQsWorkStatus
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import DataQsCallIn
from app.services import dataqs_calendar as calendar
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_notifications import DataQsNotifications, carrier_link, staff_link

CALL_MINUTES = 30
MIN_LEAD = timedelta(minutes=30)
MAX_AHEAD = timedelta(days=90)
TEXT_BEFORE = timedelta(hours=1)
TASK = "CALL_CARRIER"
REMINDER_TEXT = "CALL_REMINDER_TEXT"


def _now() -> datetime:
    return datetime.now(UTC)


def us_phone(raw: str) -> str:
    """A US number as E.164 (+1 and 10 digits)."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        raise ValidationError("Enter a 10-digit US phone number")
    return f"+1{digits}"


def pretty_phone(e164: str) -> str:
    d = e164[-10:]
    return f"({d[:3]}) {d[3:6]}-{d[6:]}"


class DataQsCallService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)
        self.notifications = DataQsNotifications(db)

    def calls(self, case_id: int) -> list[DataQsCall]:
        """The case's calls, newest first."""
        return list(
            self.db.scalars(
                select(DataQsCall)
                .where(DataQsCall.case_id == case_id)
                .order_by(DataQsCall.id.desc())
            )
        )

    def _booked(self, case_id: int) -> DataQsCall | None:
        return next((c for c in self.calls(case_id) if c.status == DataQsCallStatus.BOOKED), None)

    def _call(self, case: DataQsCase, call_id: int) -> DataQsCall:
        call = self.db.get(DataQsCall, call_id)
        if call is None or call.case_id != case.id:
            raise NotFoundError(f"Call {call_id} not found on case {case.id}")
        return call

    def book(self, user: User, case_id: int, body: DataQsCallIn) -> DataQsCall:
        case = self.access.case_to_act_on(user, case_id)
        if case.work_status == DataQsWorkStatus.CLOSED:
            raise DataQsInvalidTransitionError("This case is closed; calls can't be booked on it")
        if body.starts_at.tzinfo is None:
            raise ValidationError("Give the call's time with its time zone")
        starts_at = body.starts_at.astimezone(UTC).replace(second=0, microsecond=0)
        now = _now()
        if starts_at < now + MIN_LEAD:
            raise ValidationError("Choose a time at least 30 minutes from now")
        if starts_at > now + MAX_AHEAD:
            raise ValidationError("Choose a time within the next 90 days")
        try:
            ZoneInfo(body.time_zone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValidationError("Unknown time zone") from exc
        phone = us_phone(body.phone)
        topic = (body.topic or "").strip() or None

        call = self._booked(case.id)
        moved = call is not None
        before = None
        if call is not None:
            before = {"starts_at": call.starts_at.isoformat(), "phone": call.phone}
            call.starts_at, call.phone, call.topic = starts_at, phone, topic
            call.time_zone = body.time_zone
            call.sequence += 1
        else:
            call = DataQsCall(
                case_id=case.id,
                booked_by_id=user.id,
                phone=phone,
                starts_at=starts_at,
                duration_minutes=CALL_MINUTES,
                time_zone=body.time_zone,
                topic=topic,
                status=DataQsCallStatus.BOOKED,
                sequence=0,
            )
            self.db.add(call)
        self.db.flush()

        self.repository.complete_tasks(case, {TASK}, user, now)
        self.repository.add_task(
            case,
            TASK,
            f"Call the carrier at {calendar.when(call)}",
            DataQsActionOwner.STS,
            detail=f"Phone {pretty_phone(phone)}." + (f" Topic: {topic}" if topic else ""),
            assignee_id=case.owner_id,
        ).due_at = starts_at
        self.repository.audit(
            case,
            user,
            "call.moved" if moved else "call.booked",
            before=before,
            after={"call_id": call.id, "starts_at": starts_at.isoformat(), "phone": phone},
        )
        self._tell(case, call, user, "moved" if moved else "booked")
        self.db.commit()
        return call

    def cancel(self, user: User, case_id: int, call_id: int) -> DataQsCall:
        case = self.access.case_to_act_on(user, case_id)
        call = self._call(case, call_id)
        if call.status != DataQsCallStatus.BOOKED:
            raise DataQsInvalidTransitionError("This call isn't booked")
        now = _now()
        call.status, call.cancelled_at = DataQsCallStatus.CANCELLED, now
        if user.role.is_staff:
            call.handled_by_id = user.id
        self.repository.complete_tasks(case, {TASK}, user, now)
        self.repository.audit(case, user, "call.cancelled", after={"call_id": call.id})
        self._tell(case, call, user, "cancelled")
        self.db.commit()
        return call

    def done(self, user: User, case_id: int, call_id: int) -> DataQsCall:
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff mark a call held")
        case = self.access.case_to_act_on(user, case_id)
        call = self._call(case, call_id)
        if call.status != DataQsCallStatus.BOOKED:
            raise DataQsInvalidTransitionError("This call isn't booked")
        now = _now()
        call.status, call.done_at, call.handled_by_id = DataQsCallStatus.DONE, now, user.id
        self.repository.complete_tasks(case, {TASK}, user, now)
        self.notifications.cancel_pending(case, {REMINDER_TEXT})
        self.repository.audit(case, user, "call.done", after={"call_id": call.id})
        self.db.commit()
        return call

    def calendar_file(self, user: User, case_id: int, call_id: int) -> tuple[str, bytes]:
        """The booked call as an .ics file, to add from the case page."""
        case = self.access.case_to_view(user, case_id)
        call = self._call(case, call_id)
        link = staff_link(case) if user.role.is_staff else carrier_link(case)
        cancelled = call.status == DataQsCallStatus.CANCELLED
        return self._file_name(case), calendar.ics(call, case, link, cancelled=cancelled)

    @staticmethod
    def _file_name(case: DataQsCase) -> str:
        return f"sts-call-case-{case.id}.ics"

    def _tell(self, case: DataQsCase, call: DataQsCall, user: User, what: str) -> None:
        """Email and text the carrier; tell STS when the carrier did it."""
        n = self.notifications
        cancelled = what == "cancelled"
        time = calendar.when(call)
        phone = pretty_phone(call.phone)
        link = carrier_link(case)
        file = (self._file_name(case), calendar.ics(call, case, link, cancelled=cancelled))
        n.cancel_pending(case, {REMINDER_TEXT})

        if cancelled:
            subject = f"Your call with STS on {time} is cancelled"
            body = (
                f"Your call with STS about DataQs case {case.id} on {time} is cancelled. "
                "If you added it to your calendar, open the attached file to remove it, or "
                "delete it there. You can book another time on the case page."
            )
            first = None
            text = f"STS: your call about DataQs case {case.id} on {time} is cancelled."
        else:
            subject = (
                f"Your call with STS was moved to {time}"
                if what == "moved"
                else f"Your call with STS is booked: {time}"
            )
            body = (
                f"Your STS specialist will call you at {phone} on {time} about DataQs case "
                f"{case.id} (inspection {case.source_event_id}). The call takes about "
                f"{call.duration_minutes} minutes."
                + (f"\n\nTopic: {call.topic}" if call.topic else "")
                + "\n\nAdd it to your calendar: open the attached calendar file (Outlook, Apple "
                "Calendar or Google), which reminds you 30 minutes before, or use the Add to "
                "Google Calendar button. We'll also text you 1 hour before the call.\n\nTo move "
                "or cancel the call, open the case."
            )
            first = ("Add to Google Calendar", calendar.google_link(call, case, link))
            text = (
                f"STS: your call about DataQs case {case.id} is "
                f"{'moved to' if what == 'moved' else 'booked for'} {time}. We'll call {phone}. "
                "To move or cancel it, open the case. Replies to this number aren't read."
            )

        people = [user] if user.role.is_client else n.carrier_users(case)
        n.to_people(case, people, f"CALL_{what.upper()}", subject, body, file, first)
        recipient = call.booked_by_id
        n.text(case, recipient, "CALL_TEXT", call.phone, text)
        reminder_at = call.starts_at - TEXT_BEFORE
        if not cancelled and reminder_at > _now():
            n.text(
                case,
                recipient,
                REMINDER_TEXT,
                call.phone,
                f"STS: reminder, your STS specialist calls you at {phone} in 1 hour ({time}) "
                f"about DataQs case {case.id}.",
                at=reminder_at,
                extra={"call_id": call.id, "starts_at": call.starts_at.isoformat()},
            )

        if user.role.is_client:
            carrier = case.source_snapshot.get("carrier_name") or f"USDOT {case.usdot_number}"
            staff_file = (
                self._file_name(case),
                calendar.ics(call, case, staff_link(case), cancelled=cancelled),
            )
            n.to_staff(
                case,
                f"CALL_{what.upper()}",
                f"{carrier} {'booked a' if what == 'booked' else what + ' the'} call: {time}",
                f"{user.full_name} {'booked a' if what == 'booked' else what + ' the'} call for "
                f"DataQs case {case.id}"
                + ("." if cancelled else f": {time}, phone {phone}.")
                + (f"\n\nTopic: {call.topic}" if call.topic and not cancelled else ""),
                staff_file,
            )
