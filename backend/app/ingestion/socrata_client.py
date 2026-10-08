"""HTTP client for Socrata (SODA) datasets on data.transportation.gov (spec Section 19.1)."""

import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError

logger = logging.getLogger(__name__)

Row = dict[str, Any]


class SocrataClient:
    def __init__(self, http: httpx.Client | None = None) -> None:
        if http is None:
            settings = get_settings()
            headers = {"Accept": "application/json"}
            if settings.socrata_app_token:
                headers["X-App-Token"] = settings.socrata_app_token
            http = httpx.Client(
                base_url=settings.socrata_base_url,
                headers=headers,
                timeout=settings.socrata_timeout_seconds,
            )
        self.http = http

    def get_rows(self, dataset_id: str, params: dict[str, str]) -> list[Row]:
        """Rows matching `params` (SODA simple filters / $-parameters), exactly as returned."""
        try:
            response = self.http.get(f"/resource/{dataset_id}.json", params=params)
        except httpx.HTTPError as exc:
            raise SourceFetchError(f"Request to dataset {dataset_id} failed: {exc}") from exc

        if response.status_code != httpx.codes.OK:
            raise SourceFetchError(
                f"Dataset {dataset_id} returned HTTP {response.status_code}: {response.text[:200]}"
            )

        try:
            rows = response.json()
        except ValueError as exc:
            raise SourceFetchError(f"Dataset {dataset_id} returned invalid JSON") from exc
        if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
            raise SourceFetchError(f"Dataset {dataset_id} returned an unexpected response shape")

        logger.info("Fetched %d row(s) from dataset %s", len(rows), dataset_id)
        return rows

    def close(self) -> None:
        self.http.close()
