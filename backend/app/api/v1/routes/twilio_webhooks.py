"""Twilio webhooks: a carrier's text reply, and the answer to an automated call, carrying the FMCSA
login code (dataqs_otp_service.py).

No login: each request must carry a valid X-Twilio-Signature for PUBLIC_API_URL + the path, or it
is refused. In Twilio, point the number's "A message comes in" webhook at
PUBLIC_API_URL/api/v1/webhooks/twilio/sms (HTTP POST). Calls need nothing: each call says where to
send its answer. Parameters are never logged (a reply can contain the code).
"""

from typing import Annotated
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Header, Path, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.db.session import get_db
from app.services.dataqs_otp_service import DataQsOtpService
from app.services.twilio_client import valid_signature

router = APIRouter(prefix="/webhooks/twilio", tags=["webhooks"])

TWIML = "application/xml"


async def _verified_form(request: Request, signature: str | None) -> dict[str, str]:
    """The POSTed parameters, once the request is shown to come from Twilio."""
    settings = get_settings()
    if not settings.twilio_enabled:
        raise NotFoundError("Twilio is not set up")
    form = {key: str(value) for key, value in (await request.form()).items()}
    url = settings.public_api_url.rstrip("/") + request.url.path
    if request.url.query:
        url += f"?{request.url.query}"
    if not signature or not valid_signature(settings.twilio_auth_token or "", url, form, signature):
        raise ForbiddenError("Invalid Twilio signature")
    return form


@router.post("/sms")
async def incoming_text(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    x_twilio_signature: Annotated[str | None, Header()] = None,
) -> Response:
    """A text to STS's Twilio number: the code, when a text request to that phone is waiting."""
    form = await _verified_form(request, x_twilio_signature)
    reply = DataQsOtpService(db).receive_text(form.get("From", ""), form.get("Body", ""))
    body = f"<Response><Message>{escape(reply)}</Message></Response>" if reply else "<Response/>"
    return Response(content=body, media_type=TWIML)


@router.post("/voice/{request_id}")
async def call_answer(
    request: Request,
    request_id: Annotated[int, Path(gt=0)],
    db: Annotated[Session, Depends(get_db)],
    x_twilio_signature: Annotated[str | None, Header()] = None,
) -> Response:
    """What the carrier keyed in or said on the automated call."""
    form = await _verified_form(request, x_twilio_signature)
    twiml = DataQsOtpService(db).receive_call_answer(
        request_id, form.get("Digits"), form.get("SpeechResult")
    )
    return Response(content=twiml, media_type=TWIML)
