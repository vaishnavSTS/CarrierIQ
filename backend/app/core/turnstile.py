"""Cloudflare Turnstile: asks Cloudflare whether a form's one-time token came from a person."""

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TIMEOUT_SECONDS = 5.0
MAX_TOKEN_LENGTH = 2048  # Cloudflare's limit


class TurnstileVerifier:
    def __init__(self, http: httpx.Client | None = None) -> None:
        self._http = http or httpx.Client(timeout=TIMEOUT_SECONDS)

    def verify(self, token: str) -> bool:
        """True when Cloudflare accepts the token. Each token works once.

        If Cloudflare can't be reached the answer is True, so an outage there doesn't lock everyone
        out; the rate limits still apply.
        """
        if not token or len(token) > MAX_TOKEN_LENGTH:
            return False
        secret = get_settings().turnstile_secret_key
        try:
            response = self._http.post(VERIFY_URL, data={"secret": secret, "response": token})
            response.raise_for_status()
            result = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Turnstile could not be checked: %s", type(exc).__name__)
            return True
        if result.get("success") is True:
            return True
        logger.info("Turnstile refused a token: %s", result.get("error-codes"))
        return False
