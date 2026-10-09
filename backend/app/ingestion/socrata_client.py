"""HTTP client for Socrata (SODA) datasets on data.transportation.gov (spec Section 19.1).

Retries come from ingestion/http_retry.py.
"""

import logging
import time
from collections.abc import Callable
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError
from app.ingestion.http_retry import send_with_retries

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
        return send_with_retries(
            lambda: self.http.get(f"/resource/{dataset_id}.json", params=params),
            label=f"Dataset {dataset_id}",
            max_attempts=self.max_attempts,
            base_seconds=self.retry_base_seconds,
            sleep=self.sleep,
        )

    def close(self) -> None:
        self.http.close()
