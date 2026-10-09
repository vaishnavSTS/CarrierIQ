"""Adapter for FMCSA BOC-3 (process agent) filings by USDOT number.

A BOC-3 names the process agents who accept legal papers for the carrier in each state; FMCSA
requires one before it grants operating authority. Two datasets, neither with a filing date:
- Motus BOC3 - All With History (6snj-ed7q): FMCSA's current system, plain USDOT number.
- BOC3 - All With History (2emp-mxtb): the old L&I system (frozen 2026-05-14), USDOT number
  zero-padded to 8 digits.
"""

from app.core.config import get_settings
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import Row, SocrataClient

SOURCE = "dot_socrata"


class Boc3Adapter:
    source = SOURCE

    def __init__(self, client: SocrataClient) -> None:
        settings = get_settings()
        self.client = client
        self.motus_dataset_id = settings.motus_boc3_dataset_id
        self.legacy_dataset_id = settings.legacy_boc3_dataset_id

    def fetch_motus(self, usdot_number: int) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(
            self.motus_dataset_id, {"usdot_number": str(usdot_number)}, order=":id"
        )

    def fetch_legacy(self, usdot_number: int) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        # Exact padded value: a loose match would also hit e.g. 03297569 for 297569.
        return self.client.get_all_rows(
            self.legacy_dataset_id, {"dot_number": f"{usdot_number:08d}"}, order=":id"
        )
