"""The partner API's one answer: a carrier's Estimated ISS for a month, and nothing else.

A score already saved for that USDOT and month (an `IssSnapshot`) is returned as it is. If there
is none and the month is the newest one Carrier Safety Scan has FMCSA's tables for, the carrier is
fetched from FMCSA, the score is calculated, and it is saved (`iss_for` saves each new result),
so the next request for that month reads it from the database. Older months can't be calculated
again: the national tables for them are not kept.
"""

from collections.abc import Callable
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import CarrierNotFoundError, NotFoundError
from app.models import Carrier, IssSnapshot
from app.repositories.carrier_repository import CarrierRepository
from app.schemas.partner import PartnerIssOut
from app.services.iss_service import iss_for, latest_reference


def month_label(day: date) -> str:
    return day.strftime("%Y-%m")


class PartnerIssService:
    def __init__(self, db: Session, load_carrier: Callable[[int], Carrier | None]) -> None:
        self.db = db
        # Fetches the carrier from FMCSA (or refreshes it) and stores it: CarrierRefreshService
        self.load_carrier = load_carrier

    def score(self, usdot_number: int, month: date | None = None) -> PartnerIssOut:
        """`month`: the first day of an FMCSA data month; None for the newest one."""
        reference = latest_reference(self.db)
        newest = reference.data_month if reference else None
        wanted = month or newest
        if wanted is None:
            raise NotFoundError(
                "The Estimated ISS is not available yet: FMCSA's monthly tables "
                "have not been loaded"
            )

        saved = self._saved(usdot_number, wanted)
        if saved is not None:
            return PartnerIssOut(
                usdot_number=usdot_number, month=month_label(wanted), estimated_iss=saved.value
            )
        if wanted != newest:
            raise NotFoundError(
                f"No Estimated ISS saved for USDOT {usdot_number} for {month_label(wanted)}"
            )

        if self.load_carrier(usdot_number) is None:
            raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number} in FMCSA's data")
        result = iss_for(self.db, usdot_number)  # saves the new score
        if result is None:
            raise NotFoundError(
                f"The Estimated ISS could not be calculated for USDOT {usdot_number}"
            )
        return PartnerIssOut(
            usdot_number=usdot_number,
            month=month_label(result.data_month),
            estimated_iss=result.value,
        )

    def _saved(self, usdot_number: int, month: date) -> IssSnapshot | None:
        """The newest score saved for the carrier from that FMCSA month."""
        carrier = CarrierRepository(self.db).get_by_usdot(usdot_number)
        if carrier is None:
            return None
        return self.db.scalars(
            select(IssSnapshot)
            .where(IssSnapshot.carrier_id == carrier.id, IssSnapshot.data_month == month)
            .order_by(IssSnapshot.created_at.desc(), IssSnapshot.id.desc())
            .limit(1)
        ).first()
