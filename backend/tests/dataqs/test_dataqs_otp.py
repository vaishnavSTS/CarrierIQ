"""The FMCSA login code: the carrier chooses a text, an automated call or a call at a set time;
STS asks through Twilio (a fake here); the reply is shown only to the staff member who asked, for
10 minutes, and only from a request with a valid Twilio signature."""

import base64
import hashlib
import hmac
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import DataQsAuditEvent, DataQsOtpRequest, DataQsTask, User
from app.services import dataqs_otp_service
from app.services.dataqs_otp_service import extract_code, to_e164
from app.services.twilio_client import TwilioClient, valid_signature
from tests.dataqs.helpers import log_in, submitted_case

TOKEN = "test-auth-token"
PUBLIC = "https://api.sts.test"
PHONE = "(209) 555-0123"
E164 = "+12095550123"


class FakeTwilio:
    def __init__(self) -> None:
        self.texts: list[tuple[str, str]] = []
        self.calls: list[tuple[str, str]] = []

    def send_sms(self, to: str, body: str) -> str:
        self.texts.append((to, body))
        return "SM123"

    def start_call(self, to: str, twiml: str) -> str:
        self.calls.append((to, twiml))
        return "CA123"


@pytest.fixture
def twilio(monkeypatch: pytest.MonkeyPatch) -> FakeTwilio:
    fake = FakeTwilio()
    settings = get_settings()
    monkeypatch.setattr(settings, "twilio_account_sid", "AC123")
    monkeypatch.setattr(settings, "twilio_auth_token", TOKEN)
    monkeypatch.setattr(settings, "twilio_from_number", "+12095550100")
    monkeypatch.setattr(settings, "public_api_url", PUBLIC)
    monkeypatch.setattr(TwilioClient, "from_settings", classmethod(lambda cls: fake))
    return fake


def sign(url: str, form: dict[str, str], token: str = TOKEN) -> str:
    """What Twilio puts in X-Twilio-Signature (its documented scheme, computed independently)."""
    payload = url + "".join(f"{key}{form[key]}" for key in sorted(form))
    return base64.b64encode(
        hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()
    ).decode()


def signed_post(api: TestClient, path: str, form: dict[str, str], token: str = TOKEN):
    return api.post(
        path, data=form, headers={"X-Twilio-Signature": sign(PUBLIC + path, form, token)}
    )


def choose(api: TestClient, case_id: int, method: str, **extra: object):
    return api.put(
        f"/api/v1/portal/dataqs/cases/{case_id}/otp-preference",
        json={"method": method, "phone": PHONE, **extra},
    )


# --- Pure helpers ---------------------------------------------------------------------------------


def test_phone_numbers_and_codes_are_read_forgivingly() -> None:
    assert to_e164("(209) 555-0123") == to_e164("1-209-555-0123") == E164
    assert extract_code("Code is 123 456") == "123456"
    assert extract_code("one two three four five six") == "123456"
    assert extract_code("12") is None
    assert extract_code(None) is None


def test_twilio_signatures_must_match() -> None:
    form = {"From": E164, "Body": "123456"}
    good = sign(PUBLIC + "/x", form)
    assert valid_signature(TOKEN, PUBLIC + "/x", form, good)
    assert not valid_signature("other-token", PUBLIC + "/x", form, good)
    assert not valid_signature(TOKEN, PUBLIC + "/x", {**form, "Body": "999999"}, good)


# --- The carrier's choice -------------------------------------------------------------------------


def test_the_owner_chooses_how_to_give_the_code(api: TestClient, world: dict[str, User]) -> None:
    case = submitted_case(api)
    assert case["can_set_otp_preference"] is True and case["otp_preference"] is None

    saved = choose(api, case["id"], "TEXT")
    assert saved.status_code == 200, saved.text
    assert saved.json()["otp_preference"]["method"] == "TEXT"
    assert saved.json()["otp_preference"]["phone"] == PHONE

    assert choose(api, case["id"], "TEXT", phone="123").status_code == 422
    log_in(api, "viewer@acme.test")
    assert choose(api, case["id"], "AI_CALL").status_code == 403


def test_a_scheduled_call_becomes_a_staff_task(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = submitted_case(api)
    assert choose(api, case["id"], "SCHEDULED_CALL").status_code == 422  # needs a time
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    assert choose(api, case["id"], "SCHEDULED_CALL", call_at=past).status_code == 422

    at = datetime.now(UTC) + timedelta(days=1)
    saved = choose(api, case["id"], "SCHEDULED_CALL", call_at=at.isoformat())
    assert saved.status_code == 200, saved.text
    [task] = db.scalars(
        select(DataQsTask).where(
            DataQsTask.case_id == case["id"], DataQsTask.kind == "CALL_FOR_OTP"
        )
    ).all()
    assert task.due_at == at and task.completed_at is None

    # Changing the choice closes the task.
    assert choose(api, case["id"], "TEXT").status_code == 200
    db.refresh(task)
    assert task.completed_at is not None


# --- Asking for the code --------------------------------------------------------------------------


def test_staff_text_for_the_code_and_only_they_see_the_reply(
    api: TestClient, world: dict[str, User], db: Session, twilio: FakeTwilio
) -> None:
    case = submitted_case(api)
    choose(api, case["id"], "TEXT")

    log_in(api, "analyst@sts.test")
    asked = api.post(f"/api/v1/dataqs/cases/{case['id']}/otp-requests")
    assert asked.status_code == 200, asked.text
    assert asked.json()["otp_request"]["status"] == "SENT"
    [(to, body)] = twilio.texts
    assert to == E164 and f"DataQs request {case['id']}" in body

    # A forged reply is refused; the real one is stored.
    forged = signed_post(api, "/api/v1/webhooks/twilio/sms", {"From": E164, "Body": "1"}, "bad")
    assert forged.status_code == 403
    reply = signed_post(api, "/api/v1/webhooks/twilio/sms", {"From": E164, "Body": "482913"})
    assert reply.status_code == 200 and "received your code" in reply.text

    mine = api.get(f"/api/v1/dataqs/cases/{case['id']}").json()["otp_request"]
    assert (mine["status"], mine["code"], mine["requested_by_me"]) == ("RECEIVED", "482913", True)
    log_in(api, "admin@sts.test")
    other = api.get(f"/api/v1/dataqs/cases/{case['id']}").json()["otp_request"]
    assert other["code"] is None  # another staff member doesn't see it
    log_in(api, "owner@acme.test")
    assert api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()["otp_request"] is None

    # The code never reaches the audit trail.
    audits = db.scalars(
        select(DataQsAuditEvent).where(DataQsAuditEvent.case_id == case["id"])
    ).all()
    assert "482913" not in str([(a.before, a.after) for a in audits])

    log_in(api, "analyst@sts.test")
    used = api.post(f"/api/v1/dataqs/cases/{case['id']}/otp-requests/{mine['id']}/used").json()[
        "otp_request"
    ]
    assert (used["status"], used["code"]) == ("USED", None)
    assert db.get(DataQsOtpRequest, mine["id"]).code is None


def test_an_automated_call_takes_the_keyed_in_code(
    api: TestClient, world: dict[str, User], twilio: FakeTwilio
) -> None:
    case = submitted_case(api)
    choose(api, case["id"], "AI_CALL")
    log_in(api, "analyst@sts.test")
    request_id = api.post(f"/api/v1/dataqs/cases/{case['id']}/otp-requests").json()["otp_request"][
        "id"
    ]
    [(to, twiml)] = twilio.calls
    assert to == E164 and f"{PUBLIC}/api/v1/webhooks/twilio/voice/{request_id}" in twiml

    answer = signed_post(api, f"/api/v1/webhooks/twilio/voice/{request_id}", {"Digits": "771204"})
    assert answer.status_code == 200 and "Thank you" in answer.text
    got = api.get(f"/api/v1/dataqs/cases/{case['id']}").json()["otp_request"]
    assert got["code"] == "771204"


def test_codes_are_wiped_after_ten_minutes(
    api: TestClient, world: dict[str, User], db: Session, twilio: FakeTwilio
) -> None:
    case = submitted_case(api)
    choose(api, case["id"], "TEXT")
    log_in(api, "analyst@sts.test")
    api.post(f"/api/v1/dataqs/cases/{case['id']}/otp-requests")
    signed_post(api, "/api/v1/webhooks/twilio/sms", {"From": E164, "Body": "482913"})

    later = datetime.now(UTC) + timedelta(minutes=11)
    assert dataqs_otp_service.DataQsOtpService(db, twilio=None, now=lambda: later).wipe_expired()
    [request] = db.scalars(
        select(DataQsOtpRequest).where(DataQsOtpRequest.case_id == case["id"])
    ).all()
    assert (request.status, request.code) == ("EXPIRED", None)


def test_asking_without_twilio_or_a_texted_choice_is_explained(
    api: TestClient, world: dict[str, User]
) -> None:
    case = submitted_case(api)
    log_in(api, "analyst@sts.test")
    no_choice = api.post(f"/api/v1/dataqs/cases/{case['id']}/otp-requests")
    assert no_choice.status_code == 422

    log_in(api, "owner@acme.test")
    choose(api, case["id"], "TEXT")
    log_in(api, "analyst@sts.test")
    not_set_up = api.post(f"/api/v1/dataqs/cases/{case['id']}/otp-requests")
    assert not_set_up.status_code == 422
    assert "aren't set up yet" in not_set_up.json()["error"]["message"]
    detail = api.get(f"/api/v1/dataqs/cases/{case['id']}").json()
    assert detail["otp_automation_ready"] is False

    log_in(api, "owner@acme.test")
    assert api.post(f"/api/v1/dataqs/cases/{case['id']}/otp-requests").status_code == 403
