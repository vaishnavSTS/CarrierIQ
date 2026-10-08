"""Adapter for FMCSA insurance filings: current (Insur) and past (InsHist), in Motus and in the
legacy L&I system (frozen on 2026-05-14). See ingestion/operating_authority.py for the two systems.

Legacy current filings are keyed by docket only (no USDOT), written with the number padded to
six digits ("FF000022"), so they are looked up by the carrier's known dockets.
"""

from collections.abc import Sequence

from app.core.config import get_settings
from app.core.exceptions import SourceFetchError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import Row, SocrataClient
from app.models.enums import DocketPrefix

SOURCE = "dot_socrata"


def legacy_docket(prefix: DocketPrefix, number: str) -> str:
    """("FF", "22") -> "FF000022", the legacy Insur key format."""
    return f"{prefix.value}{number.zfill(6)}"


class InsuranceFilingAdapter:
    source = SOURCE

    def __init__(self, client: SocrataClient) -> None:
        self.client = client
        settings = get_settings()
        self.motus_current_dataset_id = settings.motus_insurance_dataset_id
        self.motus_history_dataset_id = settings.motus_insurance_history_dataset_id
        self.legacy_current_dataset_id = settings.legacy_insurance_dataset_id
        self.legacy_history_dataset_id = settings.legacy_insurance_history_dataset_id

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return f"dot_number={usdot_number}"

    def fetch_motus_current(self, usdot_number: int) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(
            self.motus_current_dataset_id,
            {"usdot_number": str(usdot_number)},
            order="docket_number, effective_date, :id",
        )

    def fetch_motus_history(self, usdot_number: int) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(
            self.motus_history_dataset_id,
            {"usdot_number": str(usdot_number)},
            order="docket_number, effective_date, :id",
        )

    def fetch_legacy_current(self, dockets: Sequence[tuple[DocketPrefix, str]]) -> list[Row]:
        if not dockets:
            return []
        keys = []
        for prefix, number in dockets:
            # Dockets go into a SoQL expression, so the number must be digits only.
            if not number.isdigit():
                raise SourceFetchError(f"Invalid docket number {number!r}")
            keys.append(f"'{legacy_docket(prefix, number)}'")
        return self.client.get_all_rows(
            self.legacy_current_dataset_id,
            {"$where": f"prefix_docket_number in ({','.join(keys)})"},
            order="prefix_docket_number, :id",
        )

    def fetch_legacy_history(self, usdot_number: int) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(
            self.legacy_history_dataset_id,
            {"dot_number": f"{usdot_number:08d}"},
            order="docket_number, :id",
        )
