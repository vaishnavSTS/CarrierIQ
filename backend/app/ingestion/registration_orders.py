"""Adapter for FMCSA registration orders by USDOT number (spec Phase 11 research).

- Out of Service Orders (p2mt-9ige): one row per order, e.g. "New Entrant Revoked - Failure of
  Safety Audit", with its status (ACTIVE / rescinded).
- Motus RevokeSuspend - All With History (wb4f-neki): revocation and suspension orders on the
  carrier's operating authority, from FMCSA's current registration system.

Rows have no id of their own; every value is text and empty fields are omitted.
"""

from collections.abc import Sequence

from app.core.config import get_settings
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import Row, SocrataClient

SOURCE = "dot_socrata"


def _in(usdot_numbers: Sequence[int]) -> str:
    """A SoQL list of validated USDOT numbers (the datasets store them as text)."""
    for usdot_number in usdot_numbers:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
    return "(" + ", ".join(f"'{int(n)}'" for n in usdot_numbers) + ")"


class RegistrationOrdersAdapter:
    source = SOURCE

    def __init__(self, client: SocrataClient) -> None:
        settings = get_settings()
        self.client = client
        self.oos_dataset_id = settings.oos_orders_dataset_id
        self.revoke_dataset_id = settings.motus_revoke_suspend_dataset_id

    def fetch_oos_orders(self, usdot_number: int) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(
            self.oos_dataset_id, {"dot_number": str(usdot_number)}, order="oos_date, :id"
        )

    def fetch_oos_orders_many(self, usdot_numbers: Sequence[int]) -> list[Row]:
        """Out-of-service orders for several USDOT numbers in one query (Chameleon check)."""
        if not usdot_numbers:
            return []
        return self.client.get_all_rows(
            self.oos_dataset_id,
            {"$where": f"dot_number in {_in(usdot_numbers)}"},
            order="dot_number, oos_date, :id",
        )

    def fetch_revocations_many(self, usdot_numbers: Sequence[int]) -> list[Row]:
        """Revocation / suspension orders for several USDOT numbers in one query."""
        if not usdot_numbers:
            return []
        return self.client.get_all_rows(
            self.revoke_dataset_id,
            {"$where": f"usdot_number in {_in(usdot_numbers)}"},
            order="usdot_number, order1_serve_date, :id",
        )

    def fetch_revocations(self, usdot_number: int) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(
            self.revoke_dataset_id,
            {"usdot_number": str(usdot_number)},
            order="order1_serve_date, :id",
        )
