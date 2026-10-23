"""Safety detail and paged inspection history for one carrier (spec Phase 5)."""

from collections.abc import Callable
from datetime import UTC, date, datetime

from app.core.exceptions import CarrierNotFoundError
from app.models import Carrier
from app.repositories.inspection_repository import InspectionRepository
from app.schemas.carrier_safety import (
    BasicDriverOut,
    CarrierSafetyOut,
    CrashSummaryOut,
    EstimatedIssOut,
    InspectionDetailOut,
    InspectionPageOut,
    IssHistoryOut,
    PullInOut,
    SmsOut,
)
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
        sms: Callable[[int], SmsOut | None] = lambda _: None,
        crashes: Callable[[int, date], CrashSummaryOut | None] = lambda _u, _d: None,
        drivers: Callable[[int, date], list[BasicDriverOut] | None] = lambda _u, _d: None,
        iss: Callable[[int], EstimatedIssOut | None] = lambda _: None,
        iss_history: Callable[[int], list[IssHistoryOut]] = lambda _: [],
        pull_in: Callable[[int | None], PullInOut | None] = lambda _: None,
    ) -> None:
        self.iss = iss
        self.iss_history = iss_history
        self.pull_in = pull_in
        self.drivers = drivers
        self.sms = sms
        self.crashes = crashes
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
        estimated = self.iss(carrier.usdot_number)
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
            sms=self.sms(carrier.usdot_number),
            crashes=self.crashes(carrier.usdot_number, self.today()),
            drivers=self.drivers(carrier.usdot_number, self.today()),
            estimated_iss=estimated,
            # After the estimate, which saves itself to the history first when it changed.
            iss_history=self.iss_history(carrier.usdot_number),
            pull_in=self.pull_in(estimated.value if estimated else None),
        )

    def inspection_page(
        self,
        usdot_number: int,
        page: int,
        page_size: int,
        oos_only: bool,
        state: str | None = None,
        search: str | None = None,
    ) -> InspectionPageOut:
        carrier = self._carrier(usdot_number)
        total, rows = self.inspections.page(
            carrier.id,
            offset=(page - 1) * page_size,
            limit=page_size,
            oos_only=oos_only,
            state=state,
            search=(search or "").strip() or None,
        )
        return InspectionPageOut(
            usdot_number=carrier.usdot_number,
            page=page,
            page_size=page_size,
            total=total,
            states=self.inspections.states(carrier.id),
            inspections=[
                InspectionDetailOut(
                    inspection_id=i.inspection_id,
                    report_number=i.report_number,
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
