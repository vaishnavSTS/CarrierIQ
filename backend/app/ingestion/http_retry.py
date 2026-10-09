"""Retrying HTTP calls to public data sources (spec Section 19.1).

Network errors, HTTP 429 and 5xx are retried with exponential backoff; any other failure raises
SourceFetchError straight away.
"""

import logging
from collections.abc import Callable

import httpx

from app.core.exceptions import SourceFetchError

logger = logging.getLogger(__name__)


def send_with_retries(
    send: Callable[[], httpx.Response],
    *,
    label: str,
    max_attempts: int,
    base_seconds: float,
    sleep: Callable[[float], None],
) -> httpx.Response:
    """`send` makes one request; `label` names the source in errors, e.g. "Dataset az4n-8mr2"."""
    for attempt in range(1, max_attempts + 1):
        try:
            response = send()
        except httpx.HTTPError as exc:
            problem = f"request failed: {exc}"
        else:
            if response.status_code == httpx.codes.OK:
                return response
            problem = f"returned HTTP {response.status_code}: {response.text[:200]}"
            if not _is_retryable(response.status_code):
                raise SourceFetchError(f"{label} {problem}")

        if attempt == max_attempts:
            raise SourceFetchError(f"{label} {problem} (after {attempt} attempts)")
        delay = base_seconds * 2 ** (attempt - 1)
        logger.warning(
            "%s %s; retrying in %.1fs (attempt %d of %d)",
            label,
            problem,
            delay,
            attempt,
            max_attempts,
        )
        sleep(delay)
    raise AssertionError("unreachable")  # the loop always returns or raises


def _is_retryable(status_code: int) -> bool:
    return status_code == httpx.codes.TOO_MANY_REQUESTS or status_code >= 500
