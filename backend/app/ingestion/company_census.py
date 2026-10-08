"""Adapter for the FMCSA Company Census File (spec Section 8.2, dataset az4n-8mr2 by default).

The primary carrier identity source. One row per USDOT number; every value arrives as text
and empty fields are omitted from the row entirely.
"""

import logging

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError, ValidationError
from app.ingestion.socrata_client import Row, SocrataClient

logger = logging.getLogger(__name__)

SOURCE = "dot_socrata"


class CompanyCensusAdapter:
    source = SOURCE

    def __init__(self, client: SocrataClient) -> None:
        self.client = client
        self.dataset_id = get_settings().census_dataset_id

    @staticmethod
    def validate_usdot_number(usdot_number: int) -> None:
        # Only a positive integer may reach the query: the API treats other text as SoQL.
        if isinstance(usdot_number, bool) or not isinstance(usdot_number, int) or usdot_number <= 0:
            raise ValidationError(f"USDOT number must be a positive integer, got {usdot_number!r}")

    @staticmethod
    def query_for(usdot_number: int) -> str:
        """How a fetch is described in ingestion_runs.query."""
        return f"dot_number={usdot_number}"

    def fetch_by_usdot(self, usdot_number: int) -> Row | None:
        """The census row for a USDOT number, or None if the source has no such carrier."""
        self.validate_usdot_number(usdot_number)
        rows = self.client.get_rows(self.dataset_id, {"dot_number": str(usdot_number)})
        if not rows:
            logger.info("USDOT %d not found in Company Census File", usdot_number)
            return None
        if len(rows) > 1:
            raise SourceFetchError(
                f"Expected one census row for USDOT {usdot_number}, got {len(rows)}"
            )

        row = rows[0]
        if row.get("dot_number") != str(usdot_number):
            raise SourceFetchError(
                f"Census returned USDOT {row.get('dot_number')!r} when {usdot_number} was requested"
            )
        return row
