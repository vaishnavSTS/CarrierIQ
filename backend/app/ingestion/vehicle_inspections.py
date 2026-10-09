"""Adapter for the FMCSA Vehicle Inspection File and its per-unit rows (spec Section 8.2).

Headers (default dataset fx4q-ay7w) are looked up by USDOT number and hold roughly the last
three years of inspections; a large carrier can have over a thousand. The vehicles on each
inspection (VINs) live in Inspections Per Unit (default wt8s-2hbx) and the individual violations
in Vehicle Inspections and Violations (default 876r-jsdb), both keyed by inspection_id.
"""

import logging
import re
from collections.abc import Sequence

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import Row, SocrataClient

logger = logging.getLogger(__name__)

SOURCE = "dot_socrata"

# Inspection IDs per request for units / violations; keeps the $where clause well under URL
# length limits.
UNIT_BATCH_SIZE = 100
VIN_BATCH_SIZE = 100
VIN_SAFE = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")


class VehicleInspectionAdapter:
    source = SOURCE

    def __init__(self, client: SocrataClient) -> None:
        self.client = client
        settings = get_settings()
        self.dataset_id = settings.inspection_dataset_id
        self.unit_dataset_id = settings.inspection_unit_dataset_id
        self.violation_dataset_id = settings.violation_dataset_id

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
        return self._by_inspection_ids(self.unit_dataset_id, inspection_ids, "insp_unit_id")

    def fetch_violations(self, inspection_ids: Sequence[str]) -> list[Row]:
        """Every violation recorded on the given inspections, as received."""
        return self._by_inspection_ids(
            self.violation_dataset_id, inspection_ids, "insp_violation_id"
        )

    def fetch_units_by_vins(self, vins: Sequence[str]) -> list[Row]:
        """Every unit row, on any carrier's inspection, carrying one of these VINs."""
        for vin in vins:
            # VINs go into a SoQL expression: only the 17-character VIN alphabet is allowed.
            if not VIN_SAFE.match(vin):
                raise SourceFetchError(f"Invalid VIN {vin!r}")
        rows: list[Row] = []
        for start in range(0, len(vins), VIN_BATCH_SIZE):
            quoted = ",".join(f"'{vin}'" for vin in vins[start : start + VIN_BATCH_SIZE])
            rows.extend(
                self.client.get_all_rows(
                    self.unit_dataset_id,
                    {"$where": f"insp_unit_vehicle_id_number in ({quoted})"},
                    order="insp_unit_id",
                )
            )
        for row in rows:
            _require_numeric_id(row, "insp_unit_id")
        return rows

    def fetch_headers(self, inspection_ids: Sequence[str]) -> list[Row]:
        """Inspection headers by inspection id, whichever carrier they belong to."""
        return self._by_inspection_ids(self.dataset_id, inspection_ids, "inspection_id")

    def _by_inspection_ids(
        self, dataset_id: str, inspection_ids: Sequence[str], key: str
    ) -> list[Row]:
        for inspection_id in inspection_ids:
            # IDs go into a SoQL expression, so only digits are allowed.
            if not inspection_id.isdigit():
                raise SourceFetchError(f"Invalid inspection_id {inspection_id!r}")

        rows: list[Row] = []
        for start in range(0, len(inspection_ids), UNIT_BATCH_SIZE):
            batch = inspection_ids[start : start + UNIT_BATCH_SIZE]
            quoted = ",".join(f"'{inspection_id}'" for inspection_id in batch)
            rows.extend(
                self.client.get_all_rows(
                    dataset_id, {"$where": f"inspection_id in ({quoted})"}, order=key
                )
            )
        for row in rows:
            _require_numeric_id(row, key)
        return rows


def _require_numeric_id(row: Row, field: str) -> None:
    value = row.get(field)
    if not isinstance(value, str) or not value.isdigit():
        raise SourceFetchError(f"Row has no valid {field}: {value!r}")
