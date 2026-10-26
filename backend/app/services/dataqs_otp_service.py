"""The FMCSA login code: when STS logs in to FMCSA to file a carrier's DataQs request, FMCSA sends
the carrier a one-time code. After submitting a request the carrier chooses how STS gets it:

- TEXT: STS texts the carrier (Twilio); the carrier replies with the code.
- AI_CALL: an automated call (Twilio) asks the carrier to key in or say the code.
- SCHEDULED_CALL: the carrier picks a time; an STS staff member calls within 5 minutes of it
  (a task on the case, due then).

A code that comes back is shown only to the staff member who asked for it, for 10 minutes, then
wiped (or as soon as they mark it used). It is never logged, emailed or put in the audit trail.
Texts and calls are off until Twilio is set up (TWILIO_* settings); choosing still works.
"""

import logging
import re
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from xml.sax.saxutils import escape, quoteattr

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    DataQsInvalidTransitionError,
    DataQsMissingAuthorityError,
    NotFoundError,
    ValidationError,
)
from app.models import DataQsCase, DataQsOtpRequest, DataQsTask, User
from app.models.enums import (
    DataQsActionOwner,
    DataQsOtpMethod,
    DataQsOtpStatus,
    DataQsWorkStatus,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_agent_access_service import DataQsAgentAccessService
from app.services.twilio_client import TwilioClient, TwilioError

logger = logging.getLogger(__name__)

CODE_TTL = timedelta(minutes=10)  # FMCSA's (Login.gov's) codes last about 10 minutes
CALL_WINDOW = timedelta(minutes=5)
LATEST_CALL = timedelta(days=60)
CALL_TASK = "CALL_FOR_OTP"
AUTOMATED = (DataQsOtpMethod.TEXT, DataQsOtpMethod.AI_CALL)

_SPOKEN = {
    "zero": "0", "oh": "0", "o": "0", "one": "1", "won": "1", "two": "2", "to": "2", "too": "2",
    "three": "3", "four": "4", "for": "4", "five": "5", "six": "6", "seven": "7", "eight": "8",
    "ate": "8", "nine": "9",
}  # fmt: skip


def _now() -> datetime:
    return datetime.now(UTC)


def to_e164(phone: str) -> str:
    """A US phone number as E.164 (+1 and 10 digits)."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10 or digits[0] in "01":
        raise ValidationError("Enter a 10-digit US phone number")
    return f"+1{digits}"


def display_phone(e164: str) -> str:
    digits = e164[-10:]
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def extract_code(text: str | None) -> str | None:
    """The code in a text reply, keypad digits or a spoken answer ("one two three ..."): its
    digits, if there are 4 to 10 of them."""
    if not text:
        return None
    words = re.findall(r"[a-z]+|\d", text.lower())
    digits = "".join(_SPOKEN.get(w, w) if not w.isdigit() else w for w in words)
    digits = re.sub(r"\D", "", digits)
    return digits if 4 <= len(digits) <= 10 else None


def sms_text(case: DataQsCase) -> str:
    return (
        f"Sky Transport Solutions (STS): FMCSA just sent you a login code for DataQs request "
        f"{case.id}. Reply to this text with that code so your STS specialist can file it. STS "
        "will never ask for your password."
    )


def call_twiml(case: DataQsCase, request: DataQsOtpRequest) -> str:
    base = get_settings().public_api_url.rstrip("/")
    action = f"{base}/api/v1/webhooks/twilio/voice/{request.id}"
    prompt = (
        f"Hello. This is Sky Transport Solutions calling about your DataQs request {case.id}. "
        "FMCSA has just sent you a login code. Please enter the code on your keypad and then "
        "press the pound key, or say the code now."
    )
    return (
        "<Response>"
        f'<Gather input="dtmf speech" action={quoteattr(action)} method="POST" timeout="20" '
        'finishOnKey="#" speechTimeout="auto">'
        f'<Say voice="Polly.Joanna">{escape(prompt)}</Say>'
        "</Gather>"
        '<Say voice="Polly.Joanna">We did not receive a code. Your STS specialist will contact '
        "you. Goodbye.</Say>"
        "</Response>"
    )


def say(text: str) -> str:
    return f'<Response><Say voice="Polly.Joanna">{escape(text)}</Say></Response>'


class DataQsOtpService:
    def __init__(
        self,
        db: Session,
        twilio: TwilioClient | None = None,
        now: Callable[[], datetime] = _now,
    ) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)
        self.twilio = twilio if twilio is not None else TwilioClient.from_settings()
        self.now = now

    # --- The carrier's choice --------------------------------------------------------------------

    def set_preference(
        self,
        user: User,
        case_id: int,
        method: DataQsOtpMethod,
        phone: str,
        call_at: datetime | None,
    ) -> DataQsCase:
        """The carrier's owner (or STS on their behalf) chooses how STS gets the code."""
        case = self.access.case_to_act_on(user, case_id)
        if case.work_status == DataQsWorkStatus.CLOSED:
            raise DataQsInvalidTransitionError("This case is closed")
        e164 = to_e164(phone)
        now = self.now()
        if method == DataQsOtpMethod.SCHEDULED_CALL:
            if call_at is None:
                raise ValidationError("Choose the date and time STS should call")
            if call_at.tzinfo is None:
                raise ValidationError("The call time needs a time zone")
            if call_at <= now:
                raise ValidationError("Choose a call time in the future")
            if call_at > now + LATEST_CALL:
                raise ValidationError("Choose a call time within the next 60 days")
        else:
            call_at = None

        before = {"method": case.otp_method, "call_at": _iso(case.otp_call_at)}
        case.otp_method, case.otp_phone, case.otp_call_at = method, e164, call_at
        case.otp_preference_set_at = now
        for task in self._open_call_tasks(case.id):
            task.completed_at, task.completed_by_id = now, user.id
        agent = DataQsAgentAccessService(self.db)
        if method == DataQsOtpMethod.AUTHORIZED_AGENT:
            agent.carrier_chose(case, user)
        else:
            agent.carrier_chose_other(case, user)
        if call_at is not None:
            self.db.add(
                DataQsTask(
                    case_id=case.id,
                    kind=CALL_TASK,
                    title=f"Call {display_phone(e164)} for the FMCSA login code",
                    detail=(
                        "The carrier chose this time. Call within 5 minutes of it, start the "
                        "FMCSA login and ask them for the code FMCSA sends."
                    ),
                    action_owner=DataQsActionOwner.STS,
                    assignee_id=case.owner_id,
                    due_at=call_at,
                )
            )
        self.db.flush()
        self.repository.audit(
            case,
            user,
            "otp.preference_set",
            before=before,
            after={"method": method.value, "call_at": _iso(call_at), "phone_last4": e164[-4:]},
        )
        self.db.commit()
        return case

    def _open_call_tasks(self, case_id: int) -> list[DataQsTask]:
        return list(
            self.db.scalars(
                select(DataQsTask).where(
                    DataQsTask.case_id == case_id,
                    DataQsTask.kind == CALL_TASK,
                    DataQsTask.completed_at.is_(None),
                )
            )
        )

    # --- Asking for the code (STS) ---------------------------------------------------------------

    def request_code(self, user: User, case_id: int) -> DataQsOtpRequest:
        """Text or call the carrier now, as they chose. Use it right after starting the FMCSA
        login, so the code FMCSA sends is fresh."""
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff can ask for the login code")
        case = self.access.case_to_act_on(user, case_id)
        if case.work_status == DataQsWorkStatus.CLOSED:
            raise DataQsInvalidTransitionError("This case is closed")
        if case.otp_method not in AUTOMATED or not case.otp_phone:
            raise ValidationError(
                "The carrier hasn't chosen a text message or an automated call for the code"
            )
        if self.twilio is None:
            raise ValidationError(
                "Texts and automated calls aren't set up yet (Twilio settings). Call the "
                "carrier yourself for now."
            )
        now = self.now()
        self._close_open_requests(case.id)
        request = DataQsOtpRequest(
            case_id=case.id,
            method=case.otp_method,
            phone=case.otp_phone,
            status=DataQsOtpStatus.SENT,
            requested_by_id=user.id,
            sent_at=now,
            expires_at=now + CODE_TTL,
        )
        self.db.add(request)
        self.db.flush()
        try:
            if request.method == DataQsOtpMethod.TEXT:
                request.provider_sid = self.twilio.send_sms(request.phone, sms_text(case))
            else:
                request.provider_sid = self.twilio.start_call(
                    request.phone, call_twiml(case, request)
                )
        except TwilioError as exc:
            request.status, request.error, request.expires_at = (
                DataQsOtpStatus.FAILED,
                str(exc),
                None,
            )
        self.repository.audit(
            case,
            user,
            "otp.requested",
            after={
                "request_id": request.id,
                "method": request.method.value,
                "status": request.status.value,
            },
        )
        self.db.commit()
        return request

    def mark_used(self, user: User, case_id: int, request_id: int) -> DataQsOtpRequest:
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff can do this")
        case = self.access.case_to_act_on(user, case_id)
        request = self.db.get(DataQsOtpRequest, request_id)
        if request is None or request.case_id != case.id:
            raise NotFoundError(f"Login code request {request_id} not found")
        if request.status in (DataQsOtpStatus.SENT, DataQsOtpStatus.RECEIVED):
            request.code, request.status, request.expires_at = None, DataQsOtpStatus.USED, None
            self.repository.audit(case, user, "otp.used", after={"request_id": request.id})
            self.db.commit()
        return request

    def _close_open_requests(self, case_id: int) -> None:
        """A new request replaces any earlier one still waiting (its code is wiped)."""
        self.db.execute(
            update(DataQsOtpRequest)
            .where(
                DataQsOtpRequest.case_id == case_id,
                DataQsOtpRequest.status.in_([DataQsOtpStatus.SENT, DataQsOtpStatus.RECEIVED]),
            )
            .values(code=None, status=DataQsOtpStatus.EXPIRED, expires_at=None)
        )

    def latest_request(self, case_id: int) -> DataQsOtpRequest | None:
        return self.db.scalar(
            select(DataQsOtpRequest)
            .where(DataQsOtpRequest.case_id == case_id)
            .order_by(DataQsOtpRequest.id.desc())
            .limit(1)
        )

    def visible_code(self, user: User, request: DataQsOtpRequest) -> str | None:
        """Only the staff member who asked sees the code, and only until it expires."""
        if (
            request.code
            and request.status == DataQsOtpStatus.RECEIVED
            and request.requested_by_id == user.id
            and request.expires_at is not None
            and request.expires_at > self.now()
        ):
            return request.code
        return None

    # --- What the carrier sends back (Twilio webhooks) -------------------------------------------

    def receive_text(self, from_phone: str, body: str) -> str | None:
        """A text to STS's number: the code, if a text request to that phone is waiting. Answers
        the reply to send back, or None for a text nobody asked for."""
        self.wipe_expired()
        try:
            phone = to_e164(from_phone)
        except ValidationError:
            return None
        request = self.db.scalar(
            select(DataQsOtpRequest)
            .where(
                DataQsOtpRequest.phone == phone,
                DataQsOtpRequest.method == DataQsOtpMethod.TEXT,
                DataQsOtpRequest.status == DataQsOtpStatus.SENT,
                DataQsOtpRequest.expires_at > self.now(),
            )
            .order_by(DataQsOtpRequest.id.desc())
            .limit(1)
        )
        if request is None:
            return None
        code = extract_code(body)
        if code is None:
            return "Please reply with just the login code FMCSA sent you (digits only)."
        self._store(request, code)
        return "Thank you. Your STS specialist received your code."

    def receive_call_answer(self, request_id: int, digits: str | None, speech: str | None) -> str:
        """The keypad digits or spoken answer from an automated call; answers TwiML to say."""
        self.wipe_expired()
        request = self.db.get(DataQsOtpRequest, request_id)
        if (
            request is None
            or request.method != DataQsOtpMethod.AI_CALL
            or request.status != DataQsOtpStatus.SENT
        ):
            return say("This request is no longer active. Your STS specialist will contact you.")
        code = extract_code(digits) or extract_code(speech)
        if code is None:
            return say(
                "Sorry, we could not understand the code. Your STS specialist will contact you. "
                "Goodbye."
            )
        self._store(request, code)
        return say("Thank you. Your code has been shared with your STS specialist. Goodbye.")

    def _store(self, request: DataQsOtpRequest, code: str) -> None:
        now = self.now()
        request.code, request.status = code, DataQsOtpStatus.RECEIVED
        request.received_at, request.expires_at = now, now + CODE_TTL
        case = self.db.get(DataQsCase, request.case_id)
        if case is not None:
            self.repository.audit(case, None, "otp.received", after={"request_id": request.id})
        self.db.commit()

    # --- Housekeeping -----------------------------------------------------------------------------

    def wipe_expired(self) -> int:
        """Wipe codes past their 10 minutes and close requests nobody answered in time."""
        result = self.db.execute(
            update(DataQsOtpRequest)
            .where(
                DataQsOtpRequest.status.in_([DataQsOtpStatus.SENT, DataQsOtpStatus.RECEIVED]),
                DataQsOtpRequest.expires_at <= self.now(),
            )
            .values(code=None, status=DataQsOtpStatus.EXPIRED)
        )
        self.db.commit()
        return int(getattr(result, "rowcount", 0) or 0)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def run_otp_wiper(stop: threading.Event, interval_seconds: float = 60.0) -> None:
    """Wipe expired codes every minute until `stop` is set (a thread of the API process)."""
    from app.db.session import SessionLocal

    while not stop.is_set():
        try:
            with SessionLocal() as db:
                DataQsOtpService(db).wipe_expired()
        except Exception:  # keep the thread alive; the next round tries again
            logger.exception("DataQs: wiping expired login codes failed")
        stop.wait(interval_seconds)
