"""Twilio over its REST API (texts and calls), and checking that a webhook really came from Twilio.

Used for asking carriers for the FMCSA login code (dataqs_otp_service.py). Off until
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are set. Nothing here logs message
bodies or webhook parameters: a carrier's reply can contain the code.
"""

import base64
import hashlib
import hmac
from collections.abc import Mapping
from dataclasses import dataclass

import httpx

from app.core.config import get_settings

API = "https://api.twilio.com/2010-04-01"


class TwilioError(Exception):
    """Twilio refused the request, or could not be reached."""


@dataclass(frozen=True)
class TwilioClient:
    account_sid: str
    auth_token: str
    from_number: str
    timeout: float = 15.0

    @classmethod
    def from_settings(cls) -> "TwilioClient | None":
        settings = get_settings()
        if not settings.twilio_enabled:
            return None
        return cls(
            settings.twilio_account_sid or "",
            settings.twilio_auth_token or "",
            settings.twilio_from_number or "",
        )

    def _post(self, resource: str, data: Mapping[str, str]) -> str:
        """POST to an account resource; answers the new message's or call's SID."""
        try:
            response = httpx.post(
                f"{API}/Accounts/{self.account_sid}/{resource}.json",
                data=dict(data),
                auth=(self.account_sid, self.auth_token),
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:
            raise TwilioError(f"Could not reach Twilio ({type(exc).__name__})") from exc
        if response.status_code >= 400:
            try:
                detail = response.json().get("message") or response.text
            except ValueError:
                detail = response.text
            raise TwilioError(f"Twilio refused it ({response.status_code}): {detail}"[:500])
        return str(response.json().get("sid", ""))

    def send_sms(self, to: str, body: str) -> str:
        return self._post("Messages", {"To": to, "From": self.from_number, "Body": body})

    def start_call(self, to: str, twiml: str) -> str:
        return self._post("Calls", {"To": to, "From": self.from_number, "Twiml": twiml})


def valid_signature(auth_token: str, url: str, params: Mapping[str, str], signature: str) -> bool:
    """Twilio's request signature: HMAC-SHA1 of the full URL followed by each POST parameter's
    name and value, sorted by name, base64-encoded (Twilio's "Webhooks security" scheme)."""
    payload = url + "".join(f"{key}{params[key]}" for key in sorted(params))
    digest = hmac.new(auth_token.encode(), payload.encode(), hashlib.sha1).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)
