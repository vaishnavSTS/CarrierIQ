"""Adapter for FMCSA operating-authority datasets (spec Sections 8.2, 8.3).

Two systems hold the data. Motus (FMCSA's current registration system) is updated daily but does
not yet hold every carrier; the legacy Licensing & Insurance (L&I) datasets cover everyone and
were frozen on their last refresh (2026-05-14). Both are fetched per carrier by USDOT number.
Formats differ: Motus USDOT numbers are plain digits, legacy ones are zero-padded to 8 digits.
"""

import logging

from app.core.config import get_settings
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import Row, SocrataClient

logger = logging.getLogger(__name__)

SOURCE = "dot_socrata"


class OperatingAuthorityAdapter:
    source = SOURCE

    def __init__(self, client: SocrataClient) -> None:
        self.client = client
        settings = get_settings()
        self.motus_carrier_dataset_id = settings.motus_carrier_dataset_id
        self.motus_authhist_dataset_id = settings.motus_authhist_dataset_id
        self.legacy_carrier_dataset_id = settings.legacy_carrier_dataset_id
        self.legacy_authhist_dataset_id = settings.legacy_authhist_dataset_id

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return f"dot_number={usdot_number}"

    def fetch_motus_carrier(self, usdot_number: int) -> list[Row]:
        """Current authority per docket from Motus."""
        return self._motus(self.motus_carrier_dataset_id, usdot_number, "docket_number")

    def fetch_motus_history(self, usdot_number: int) -> list[Row]:
        """Authority status changes from Motus."""
        return self._motus(
            self.motus_authhist_dataset_id, usdot_number, "docket_number, status_change_date"
        )

    def fetch_legacy_carrier(self, usdot_number: int) -> list[Row]:
        """Authority per docket from legacy L&I, as of its freeze date."""
        return self._legacy(self.legacy_carrier_dataset_id, usdot_number, "docket_number")

    def fetch_legacy_history(self, usdot_number: int) -> list[Row]:
        """Authority actions from legacy L&I."""
        return self._legacy(
            self.legacy_authhist_dataset_id, usdot_number, "docket_number, orig_served_date"
        )

    def _motus(self, dataset_id: str, usdot_number: int, order: str) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(
            dataset_id, {"usdot_number": str(usdot_number)}, order=f"{order}, :id"
        )

    def _legacy(self, dataset_id: str, usdot_number: int, order: str) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(
            dataset_id, {"dot_number": f"{usdot_number:08d}"}, order=f"{order}, :id"
        )
