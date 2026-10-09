"""Adapter for the FMCSA Company Census File (spec Section 8.2, dataset az4n-8mr2 by default).

The primary carrier identity source. One row per USDOT number; every value arrives as text
and empty fields are omitted from the row entirely.
"""

import logging

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError, ValidationError
from app.ingestion.socrata_client import Row, SocrataClient
from app.models.enums import DocketPrefix

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

    def find_contact_matches(self, where: str, limit: int) -> list[Row]:
        """Census rows matching a contact filter built by ingestion/contact_match.py."""
        return self.client.get_rows(
            self.dataset_id, {"$where": where, "$order": "dot_number", "$limit": str(limit)}
        )

    def find_usdots_by_docket(self, prefix: DocketPrefix, number: str, limit: int) -> list[int]:
        """USDOT numbers holding this docket in any of the three docket slots.

        One docket can belong to several USDOT numbers (seen on the live API).
        """
        if not number.isdigit():
            raise ValidationError(f"Docket number must be digits, got {number!r}")
        slots = " OR ".join(
            f"(docket{n}prefix='{prefix.value}' AND docket{n}='{number}')" for n in (1, 2, 3)
        )
        rows = self.client.get_rows(
            self.dataset_id,
            {
                "$select": "dot_number",
                "$where": slots,
                "$order": "dot_number",
                "$limit": str(limit),
            },
        )
        return [int(row["dot_number"]) for row in rows if str(row.get("dot_number", "")).isdigit()]

    def search_by_name(self, name: str, limit: int) -> list[Row]:
        """Census rows whose legal or DBA name matches `name`, best matches first.

        Names that start with `name` come first, then names that merely contain it; active
        carriers first within each. Two requests, so a common word can't push the real matches
        out of an alphabetical top-N. `name` must already be cleaned
        (see services/carrier_search_query.py).
        """
        if not name or "%" in name or "_" in name:
            raise ValidationError(f"Invalid name search {name!r}")
        literal = name.upper().replace("'", "''")
        starts = (
            f"starts_with(upper(legal_name), '{literal}') "
            f"OR starts_with(upper(dba_name), '{literal}')"
        )
        contains = f"upper(legal_name) like '%{literal}%' OR upper(dba_name) like '%{literal}%'"

        rows: list[Row] = []
        seen: set[str] = set()
        for where in (starts, contains):
            for row in self.client.get_rows(
                self.dataset_id,
                {
                    "$where": where,
                    "$order": "status_code, legal_name, dot_number",
                    "$limit": str(limit),
                },
            ):
                if row.get("dot_number") not in seen and len(rows) < limit:
                    seen.add(str(row.get("dot_number")))
                    rows.append(row)
            if len(rows) >= limit:
                break
        return rows
