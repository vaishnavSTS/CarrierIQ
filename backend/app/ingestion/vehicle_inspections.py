"""Adapter for the FMCSA Vehicle Inspection File and its per-unit rows (spec Section 8.2).

Headers (default dataset fx4q-ay7w) are looked up by USDOT number and hold roughly the last
three years of inspections; a large carrier can have over a thousand. The vehicles on each
inspection (VINs) live in Inspections Per Unit (default wt8s-2hbx), keyed by inspection_id.
"""

import logging
from collections.abc import Sequence

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import Row, SocrataClient

logger = logging.getLogger(__name__)

SOURCE = "dot_socrata"

# Inspection IDs per unit request; keeps the $where clause well under URL length limits.
UNIT_BATCH_SIZE = 100


class VehicleInspectionAdapter:
    source = SOURCE

    def __init__(self, client: SocrataClient) -> None:
        self.client = client
        settings = get_settings()
        self.dataset_id = settings.inspection_dataset_id
        self.unit_dataset_id = settings.inspection_unit_dataset_id

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return f"dot_number={usdot_number}"

    def fetch_by_usdot(self, usdot_number: int) -> list[Row]:
        """Every inspection header for the carrier, as received."""
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        rows = self.client.get_all_rows(
            self.dataset_id, {"dot_number": str(usdot_number)}, order="inspection_id"
        )
        for row in rows:
            if row.get("dot_number") != str(usdot_number):
                raise SourceFetchError(
                    f"Inspection {row.get('inspection_id')!r} belongs to USDOT "
                    f"{row.get('dot_number')!r}, not {usdot_number}"
                )
            _require_numeric_id(row, "inspection_id")
        return rows

    def fetch_units(self, inspection_ids: Sequence[str]) -> list[Row]:
        """Every vehicle unit on the given inspections, as received."""
        for inspection_id in inspection_ids:
            # IDs go into a SoQL expression, so only digits are allowed.
            if not inspection_id.isdigit():
                raise SourceFetchError(f"Invalid inspection_id {inspection_id!r}")

        units: list[Row] = []
        for start in range(0, len(inspection_ids), UNIT_BATCH_SIZE):
            batch = inspection_ids[start : start + UNIT_BATCH_SIZE]
            quoted = ",".join(f"'{inspection_id}'" for inspection_id in batch)
            units.extend(
                self.client.get_all_rows(
                    self.unit_dataset_id,
                    {"$where": f"inspection_id in ({quoted})"},
                    order="insp_unit_id",
                )
            )
        for unit in units:
            _require_numeric_id(unit, "insp_unit_id")
        return units


def _require_numeric_id(row: Row, field: str) -> None:
    value = row.get(field)
    if not isinstance(value, str) or not value.isdigit():
        raise SourceFetchError(f"Row has no valid {field}: {value!r}")
