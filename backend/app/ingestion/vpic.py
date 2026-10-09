"""Client for NHTSA vPIC VIN decoding (spec Sections 8.4, 19.1).

Uses the batch endpoint (DecodeVINValuesBatch, up to 50 VINs per call). Every result is returned
exactly as received; a VIN decode never changes, so callers cache it permanently.
"""

import logging
import re
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError
from app.ingestion.http_retry import send_with_retries

logger = logging.getLogger(__name__)

SOURCE = "nhtsa_vpic"
DATASET_ID = "DecodeVINValuesBatch"
_VIN_SAFE = re.compile(r"^[A-Z0-9]{1,17}$")

Row = dict[str, Any]


class VpicClient:
    source = SOURCE
    dataset_id = DATASET_ID

    def __init__(
        self,
        http: httpx.Client | None = None,
        *,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        settings = get_settings()
        self.http = http or httpx.Client(
            base_url=settings.vpic_base_url, timeout=settings.vpic_timeout_seconds
        )
        self.batch_size = settings.vpic_batch_size
        self.parallel_requests = settings.vpic_parallel_requests
        self.max_attempts = settings.socrata_max_attempts
        self.retry_base_seconds = settings.socrata_retry_base_seconds
        self.sleep = sleep

    def decode(self, vins: Sequence[str]) -> list[Row]:
        """One result per VIN, in batches; raises SourceFetchError if vPIC can't be reached."""
        for vin in vins:
            if not _VIN_SAFE.match(vin):
                raise SourceFetchError(f"Invalid VIN {vin!r}")
        batches = [vins[i : i + self.batch_size] for i in range(0, len(vins), self.batch_size)]
        # A few batches at a time: much faster for large fleets, still light on a free service.
        with ThreadPoolExecutor(max_workers=self.parallel_requests) as pool:
            pages = list(pool.map(self._decode_batch, batches))
        results = [row for page in pages for row in page]
        logger.info("Decoded %d VIN(s) with NHTSA vPIC", len(results))
        return results

    def _decode_batch(self, batch: Sequence[str]) -> list[Row]:
        response = send_with_retries(
            partial(self._post_batch, batch),
            label="NHTSA vPIC",
            max_attempts=self.max_attempts,
            base_seconds=self.retry_base_seconds,
            sleep=self.sleep,
        )
        try:
            rows = response.json()["Results"]
        except (ValueError, KeyError, TypeError) as exc:
            raise SourceFetchError("NHTSA vPIC returned an unexpected response") from exc
        if not isinstance(rows, list):
            raise SourceFetchError("NHTSA vPIC returned an unexpected response")
        return [r for r in rows if isinstance(r, dict)]

    def _post_batch(self, vins: Sequence[str]) -> httpx.Response:
        return self.http.post(
            "/DecodeVINValuesBatch/", data={"format": "json", "data": ";".join(vins)}
        )
