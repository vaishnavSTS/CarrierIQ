"""Safety detail and paged inspection history for one carrier (spec Phase 5)."""

from collections import defaultdict
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime

from app.core.exceptions import CarrierNotFoundError
from app.models import Carrier, Inspection, SmsViolation
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
    SmsInspectionOut,
    SmsOut,
    SmsViolationOut,
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
        sms_violations: Callable[[int], list[SmsViolation] | None] = lambda _: None,
    ) -> None:
        self.sms_violations = sms_violations
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
            sms_inspections=sms_inspection_history(
                self.sms_violations(carrier.usdot_number), inspections
            ),
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


def sms_inspection_history(
    violations: Sequence[SmsViolation] | None, inspections: Sequence[Inspection]
) -> list[SmsInspectionOut] | None:
    """FMCSA's SMS violations grouped by inspection (newest first, heaviest violation first), with
    the report number, state and plate from the inspection itself when it is on file. The SMS file
    and the inspection file use different ids, so an inspection is matched by id, else by date when
    the carrier had only one inspection that day."""
    if violations is None:
        return None
    by_id = {i.inspection_id: i for i in inspections}
    by_date: dict[date, list[Inspection]] = defaultdict(list)
    for i in inspections:
        by_date[i.inspection_date].append(i)
    grouped: dict[str, list[SmsViolation]] = defaultdict(list)
    for v in violations:
        grouped[v.inspection_id].append(v)
    out = []
    for inspection_id, rows in grouped.items():
        same_day = by_date.get(rows[0].inspection_date, [])
        found = by_id.get(inspection_id) or (same_day[0] if len(same_day) == 1 else None)
        out.append(
            SmsInspectionOut(
                inspection_id=inspection_id,
                inspection_date=rows[0].inspection_date,
                report_number=found.report_number if found else None,
                state=found.state if found else None,
                level=found.inspection_level if found else None,
                plate=found.plate if found else None,
                plate_state=found.plate_state if found else None,
                vin=found.vin if found else None,
                vehicle_oos=found.vehicle_oos if found else False,
                driver_oos=found.driver_oos if found else False,
                violations=[
                    SmsViolationOut(
                        code=v.code,
                        description=v.description,
                        basic=v.basic,
                        group=v.group,
                        unit=v.unit,
                        out_of_service=v.out_of_service,
                        severity_weight=v.severity_weight,
                        time_weight=v.time_weight,
                        total_weight=float(v.total_weight),
                    )
                    for v in sorted(rows, key=lambda r: r.total_weight, reverse=True)
                ],
            )
        )
    return sorted(out, key=lambda i: i.inspection_date, reverse=True)
