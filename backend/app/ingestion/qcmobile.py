"""Client for FMCSA's QCMobile API: one carrier's snapshot by USDOT number, including its EIN.

GET {qcmobile_base_url}/carriers/{dotNumber}?webKey=KEY returns `content.carrier` (legal name,
authority and insurance flags, out-of-service rates, `ein`, ...). The WebKey is a secret: it is
never stored or logged. httpx logs every request URL at INFO, so a filter on its loggers blanks
`webKey` values, and error messages are scrubbed the same way. Only `content.carrier` is stored.
"""

import logging
import re
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.http_retry import send_with_retries

logger = logging.getLogger(__name__)

SOURCE = "fmcsa_qcmobile"
DATASET_ID = "carriers"

Row = dict[str, Any]

_WEB_KEY = re.compile(r"(webkey=)[^&\s\"'<>]+", re.IGNORECASE)


def redact(text: str) -> str:
    """Blank any `webKey=...` value in a URL or message."""
    return _WEB_KEY.sub(r"\1[redacted]", text)


class RedactWebKeyFilter(logging.Filter):
    """Rewrites log records that would print a QCMobile URL, so the WebKey never reaches a log."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "webkey=" in message.lower():
            record.msg = redact(message)
            record.args = None
        return True


_FILTER = RedactWebKeyFilter()


def install_log_redaction() -> None:
    """Attach the filter to the loggers that print request URLs (idempotent)."""
    for name in ("httpx", "httpcore"):
        target = logging.getLogger(name)
        if _FILTER not in target.filters:
            target.addFilter(_FILTER)


def normalize_ein(value: object) -> str | None:
    """An EIN as 9 digits; None when missing or zero. QCMobile sends a number, which drops
    leading zeros, so shorter values are padded back."""
    if isinstance(value, bool) or value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    if not 1 <= len(digits) <= 9 or set(digits) == {"0"}:
        return None
    return digits.zfill(9)


def carrier_of(body: object) -> Row | None:
    """`content.carrier` from a QCMobile response body; None when FMCSA has no such carrier."""
    if not isinstance(body, dict):
        raise SourceFetchError("FMCSA QCMobile returned an unexpected response")
    content = body.get("content")
    if content is None:
        return None
    carrier = content.get("carrier") if isinstance(content, dict) else None
    if carrier is None:
        return None
    if not isinstance(carrier, dict):
        raise SourceFetchError("FMCSA QCMobile returned an unexpected response")
    scrubbed: Row = _scrub(carrier)
    return scrubbed


def _scrub(value: Any) -> Any:
    """The payload with any WebKey that FMCSA might echo in a link removed."""
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {k: _scrub(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


class QcMobileClient:
    source = SOURCE
    dataset_id = DATASET_ID

    def __init__(
        self,
        http: httpx.Client | None = None,
        *,
        web_key: str | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        settings = get_settings()
        install_log_redaction()
        self.web_key = web_key if web_key is not None else settings.qcmobile_web_key
        self.http = http or httpx.Client(
            base_url=settings.qcmobile_base_url, timeout=settings.qcmobile_timeout_seconds
        )
        self.parallel_requests = settings.qcmobile_parallel_requests
        self.max_attempts = settings.socrata_max_attempts
        self.retry_base_seconds = settings.socrata_retry_base_seconds
        self.sleep = sleep

    @property
    def enabled(self) -> bool:
        return bool(self.web_key)

    def fetch_carrier(self, usdot_number: int) -> Row | None:
        """The carrier's snapshot; None when FMCSA has no such carrier. Raises SourceFetchError
        (with the WebKey scrubbed from the message) when QCMobile can't be reached."""
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        if not self.enabled:
            raise SourceFetchError("FMCSA QCMobile WebKey is not configured")
        try:
            response = send_with_retries(
                lambda: self.http.get(
                    f"/carriers/{usdot_number}", params={"webKey": self.web_key or ""}
                ),
                label="FMCSA QCMobile",
                max_attempts=self.max_attempts,
                base_seconds=self.retry_base_seconds,
                sleep=self.sleep,
            )
            body = response.json()
        except SourceFetchError as exc:
            raise SourceFetchError(redact(exc.message)) from None
        except ValueError:
            raise SourceFetchError("FMCSA QCMobile returned an unexpected response") from None
        return carrier_of(body)

    def fetch_many(self, usdot_numbers: Sequence[int]) -> tuple[dict[int, Row | None], list[int]]:
        """Snapshots for several carriers, a few at a time: (found by USDOT, USDOTs that failed)."""

        def one(usdot_number: int) -> tuple[int, Row | None, bool]:
            try:
                return usdot_number, self.fetch_carrier(usdot_number), True
            except SourceFetchError as exc:
                logger.warning("QCMobile USDOT %d: %s", usdot_number, exc.message)
                return usdot_number, None, False

        found: dict[int, Row | None] = {}
        failed: list[int] = []
        with ThreadPoolExecutor(max_workers=self.parallel_requests) as pool:
            for usdot_number, row, ok in pool.map(one, usdot_numbers):
                if ok:
                    found[usdot_number] = row
                else:
                    failed.append(usdot_number)
        return found, failed

    def close(self) -> None:
        self.http.close()
