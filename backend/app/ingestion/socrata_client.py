"""HTTP client for Socrata (SODA) datasets on data.transportation.gov (spec Section 19.1).

Network errors, HTTP 429 and 5xx are retried with exponential backoff; other failures raise
SourceFetchError straight away.
"""

import logging
import time
from collections.abc import Callable
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError

logger = logging.getLogger(__name__)

Row = dict[str, Any]


class SocrataClient:
    def __init__(
        self,
        http: httpx.Client | None = None,
        *,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        settings = get_settings()
        if http is None:
            headers = {"Accept": "application/json"}
            if settings.socrata_app_token:
                headers["X-App-Token"] = settings.socrata_app_token
            http = httpx.Client(
                base_url=settings.socrata_base_url,
                headers=headers,
                timeout=settings.socrata_timeout_seconds,
            )
        self.http = http
        self.sleep = sleep
        self.page_size = settings.socrata_page_size
        self.max_attempts = settings.socrata_max_attempts
        self.retry_base_seconds = settings.socrata_retry_base_seconds

    def get_rows(self, dataset_id: str, params: dict[str, str]) -> list[Row]:
        """One request: rows matching `params` (SODA filters / $-parameters), as returned."""
        response = self._get_with_retries(dataset_id, params)

        try:
            rows = response.json()
        except ValueError as exc:
            raise SourceFetchError(f"Dataset {dataset_id} returned invalid JSON") from exc
        if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
            raise SourceFetchError(f"Dataset {dataset_id} returned an unexpected response shape")

        logger.info("Fetched %d row(s) from dataset %s", len(rows), dataset_id)
        return rows

    def get_all_rows(self, dataset_id: str, params: dict[str, str], order: str) -> list[Row]:
        """Every matching row, fetched page by page. `order` must give a stable sort."""
        rows: list[Row] = []
        while True:
            page = self.get_rows(
                dataset_id,
                {
                    **params,
                    "$order": order,
                    "$limit": str(self.page_size),
                    "$offset": str(len(rows)),
                },
            )
            rows.extend(page)
            if len(page) < self.page_size:
                return rows

    def _get_with_retries(self, dataset_id: str, params: dict[str, str]) -> httpx.Response:
        url = f"/resource/{dataset_id}.json"
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = self.http.get(url, params=params)
            except httpx.HTTPError as exc:
                problem = f"request failed: {exc}"
            else:
                if response.status_code == httpx.codes.OK:
                    return response
                problem = f"returned HTTP {response.status_code}: {response.text[:200]}"
                if not _is_retryable(response.status_code):
                    raise SourceFetchError(f"Dataset {dataset_id} {problem}")

            if attempt == self.max_attempts:
                raise SourceFetchError(f"Dataset {dataset_id} {problem} (after {attempt} attempts)")
            delay = self.retry_base_seconds * 2 ** (attempt - 1)
            logger.warning(
                "Dataset %s %s; retrying in %.1fs (attempt %d of %d)",
                dataset_id,
                problem,
                delay,
                attempt,
                self.max_attempts,
            )
            self.sleep(delay)
        raise AssertionError("unreachable")  # the loop always returns or raises

    def close(self) -> None:
        self.http.close()


def _is_retryable(status_code: int) -> bool:
    return status_code == httpx.codes.TOO_MANY_REQUESTS or status_code >= 500
