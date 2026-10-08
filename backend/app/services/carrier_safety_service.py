"""Safety detail and paged inspection history for one carrier (spec Phase 5)."""

from collections.abc import Callable
from datetime import UTC, date, datetime

from app.core.exceptions import CarrierNotFoundError
from app.models import Carrier
from app.repositories.inspection_repository import InspectionRepository
from app.schemas.carrier_safety import CarrierSafetyOut, InspectionDetailOut, InspectionPageOut
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.safety_analysis import (
    counts_by,
    quarterly_trend,
    violation_details,
    violation_summary,
)


class CarrierSafetyService:
    def __init__(
        self,
        refresh: CarrierRefreshService,
        inspections: InspectionRepository,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        self.refresh = refresh
        self.inspections = inspections
        self.today = today

    def _carrier(self, usdot_number: int) -> Carrier:
        carrier = self.refresh.ensure_fresh(usdot_number).carrier
        if carrier is None:
            raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number}")
        return carrier

    def safety(self, usdot_number: int) -> CarrierSafetyOut:
        carrier = self._carrier(usdot_number)
        inspections = self.inspections.for_carrier(carrier.id)
        return CarrierSafetyOut(
            usdot_number=carrier.usdot_number,
            inspection_count=len(inspections),
            quarters=quarterly_trend(inspections, self.today()),
            by_level=sorted(
                counts_by(
                    str(i.inspection_level) if i.inspection_level is not None else None
                    for i in inspections
                ),
                key=lambda c: (not c.key.isdigit(), int(c.key) if c.key.isdigit() else 0),
            ),
            by_state=counts_by(i.state for i in inspections),
            violations=violation_summary(inspections),
        )

    def inspection_page(
        self, usdot_number: int, page: int, page_size: int, oos_only: bool
    ) -> InspectionPageOut:
        carrier = self._carrier(usdot_number)
        total, rows = self.inspections.page(
            carrier.id, offset=(page - 1) * page_size, limit=page_size, oos_only=oos_only
        )
        return InspectionPageOut(
            usdot_number=carrier.usdot_number,
            page=page,
            page_size=page_size,
            total=total,
            inspections=[
                InspectionDetailOut(
                    inspection_id=i.inspection_id,
                    inspection_date=i.inspection_date,
                    level=i.inspection_level,
                    state=i.state,
                    location=i.location,
                    vin=i.vin,
                    vehicle_oos=i.vehicle_oos,
                    driver_oos=i.driver_oos,
                    violation_count=(i.violation_data or {}).get("viol_total", 0),
                    violations=violation_details(i),
                )
                for i in rows
            ],
        )
