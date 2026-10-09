"""Carrier profile (spec Section 6): one carrier's identity, authority, safety, equipment and
recent changes, refreshed on demand first (spec Section 19.2)."""

import logging
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime, timedelta
from itertools import pairwise

from app.core.exceptions import CarrierNotFoundError
from app.core.inspection_levels import NATIONAL_DRIVER_OOS_RATE, NATIONAL_VEHICLE_OOS_RATE
from app.models import Address, Carrier, CarrierAttributeHistory, Domain, Officer, Phone
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_history_repository import CarrierHistoryRepository
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.repositories.signal_repository import SignalRepository
from app.repositories.timeline_repository import TimelineRepository
from app.schemas.carrier_profile import (
    AddressOut,
    AuthorityOut,
    CarrierProfile,
    ChangeOut,
    EquipmentOut,
    InspectionOut,
    InspectionYearOut,
    InsuranceOut,
    OosWindowOut,
    PhoneOut,
    SafetyOut,
    TimelineEventOut,
    VehicleOut,
)
from app.schemas.carrier_search import DocketOut
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.carrier_search_service import authority_status
from app.services.insurance_status import insurance_status

logger = logging.getLogger(__name__)

RECENT_INSPECTIONS = 10
VEHICLES_LISTED = 25
RECENT_CHANGES = 20
TIMELINE_EVENTS = 200
RECENT_MONTHS = 24  # out-of-service window, as on FMCSA SAFER


class CarrierProfileService:
    def __init__(
        self,
        refresh: CarrierRefreshService,
        observed: ObservedValueRepository,
        authorities: AuthorityRepository,
        inspections: InspectionRepository,
        history: CarrierHistoryRepository,
        insurance: InsuranceRepository,
        timeline: TimelineRepository,
        signals: SignalRepository,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        self.today = today
        self.refresh = refresh
        self.observed = observed
        self.authorities = authorities
        self.inspections = inspections
        self.history = history
        self.insurance = insurance
        self.timeline = timeline
        self.signals = signals

    def get(self, usdot_number: int) -> CarrierProfile:
        outcome = self.refresh.ensure_fresh(usdot_number)
        carrier = outcome.carrier
        if carrier is None:
            raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number}")

        dockets = self.authorities.for_carrier(carrier.id)
        coverage = insurance_status(dockets, self.insurance.for_carrier(carrier.id))
        review = self.signals.open_signals([carrier.id])[carrier.id]
        return CarrierProfile(
            usdot_number=carrier.usdot_number,
            legal_name=carrier.legal_name,
            dba_name=carrier.dba_name,
            entity_type=carrier.entity_type,
            registration_status=carrier.registration_status,
            operation_classification=carrier.operation_classification,
            email=carrier.email,
            website=carrier.website,
            driver_count=carrier.driver_count,
            first_registered_date=carrier.first_registered_date,
            last_mcs150_date=carrier.last_mcs150_date,
            last_refreshed_at=carrier.last_refreshed_at,
            stale=outcome.stale,
            addresses=[_address(a) for a in self.observed.current(Address, carrier.id)],
            phones=[
                PhoneOut(
                    phone_type=p.phone_type.value,
                    number=p.number_normalized,
                    first_seen=p.first_seen,
                )
                for p in self.observed.current(Phone, carrier.id)
            ],
            officers=[o.name for o in self.observed.current(Officer, carrier.id)],
            domains=[d.domain for d in self.observed.current(Domain, carrier.id)],
            authority=AuthorityOut(
                status=authority_status([a.status for a in dockets]),
                dockets=[
                    DocketOut(prefix=a.docket_prefix.value, number=a.docket_number, status=a.status)
                    for a in dockets
                ],
            ),
            insurance=InsuranceOut(
                status=coverage.status, source_system=coverage.source_system, as_of=coverage.as_of
            ),
            timeline=[
                TimelineEventOut(
                    event_type=e.event_type,
                    event_date=e.event_date,
                    severity=e.severity.value,
                    title=e.title,
                    description=e.description,
                    signal_id=e.signal_id,
                )
                for e in self.timeline.for_carrier(carrier.id)[:TIMELINE_EVENTS]
            ],
            safety=self._safety(carrier),
            equipment=self._equipment(carrier),
            review_status=review.review_status,
            open_signal_count=review.count,
            highest_open_severity=review.highest_severity,
            recent_changes=recent_changes(self.history.all_for_carrier(carrier.id))[
                :RECENT_CHANGES
            ],
        )

    def _safety(self, carrier: Carrier) -> SafetyOut:
        summary = self.inspections.summary(carrier.id)
        since = self.today() - timedelta(days=round(RECENT_MONTHS * 365.25 / 12))
        recent = self.inspections.summary(carrier.id, since=since)
        return SafetyOut(
            inspection_count=summary.count,
            vehicle_inspection_count=summary.vehicle_inspections,
            driver_inspection_count=summary.driver_inspections,
            vehicle_oos_count=summary.vehicle_oos,
            driver_oos_count=summary.driver_oos,
            vehicle_oos_rate=_rate(summary.vehicle_oos, summary.vehicle_inspections),
            driver_oos_rate=_rate(summary.driver_oos, summary.driver_inspections),
            recent=OosWindowOut(
                months=RECENT_MONTHS,
                inspections=recent.count,
                vehicle_inspections=recent.vehicle_inspections,
                driver_inspections=recent.driver_inspections,
                vehicle_oos=recent.vehicle_oos,
                driver_oos=recent.driver_oos,
                vehicle_oos_rate=_rate(recent.vehicle_oos, recent.vehicle_inspections),
                driver_oos_rate=_rate(recent.driver_oos, recent.driver_inspections),
                national_vehicle_oos_rate=NATIONAL_VEHICLE_OOS_RATE,
                national_driver_oos_rate=NATIONAL_DRIVER_OOS_RATE,
            ),
            first_inspection_date=summary.first_date,
            last_inspection_date=summary.last_date,
            by_year=[
                InspectionYearOut(year=y, inspections=n, vehicle_oos=v, driver_oos=d)
                for y, n, v, d in self.inspections.by_year(carrier.id)
            ],
            recent_inspections=[
                InspectionOut(
                    inspection_id=i.inspection_id,
                    inspection_date=i.inspection_date,
                    level=i.inspection_level,
                    state=i.state,
                    location=i.location,
                    vin=i.vin,
                    vehicle_oos=i.vehicle_oos,
                    driver_oos=i.driver_oos,
                    violations=(i.violation_data or {}).get("viol_total", 0),
                )
                for i in self.inspections.recent(carrier.id, RECENT_INSPECTIONS)
            ],
            safety_rating=carrier.safety_rating,
            safety_rating_date=carrier.safety_rating_date,
        )

    def _equipment(self, carrier: Carrier) -> EquipmentOut:
        total, vehicles = self.inspections.vehicles(carrier.id, VEHICLES_LISTED)
        return EquipmentOut(
            power_units=carrier.fleet_size,
            observed_vehicle_count=total,
            vehicles=[
                VehicleOut(vin=vin, inspections=n, first_seen=first, last_seen=last)
                for vin, n, first, last in vehicles
            ],
        )


def recent_changes(rows: Sequence[CarrierAttributeHistory]) -> list[ChangeOut]:
    """Before/after pairs from history, newest first. The first value of each attribute is the
    carrier's first load, not a change, so it is skipped."""
    by_attribute: dict[str, list[CarrierAttributeHistory]] = {}
    for row in rows:
        by_attribute.setdefault(row.attribute, []).append(row)
    changes = [
        ChangeOut(
            attribute=attribute,
            old_value=old.value,
            new_value=new.value,
            changed_on=new.valid_from,
        )
        for attribute, values in by_attribute.items()
        for old, new in pairwise(sorted(values, key=lambda r: r.id))
    ]
    return sorted(changes, key=lambda c: (c.changed_on, c.attribute), reverse=True)


def _address(address: Address) -> AddressOut:
    return AddressOut(
        address_type=address.address_type.value,
        street=address.street,
        city=address.city,
        state=address.state,
        zip=address.zip,
        country=address.country,
        undeliverable=address.undeliverable,
        first_seen=address.first_seen,
        last_seen=address.last_seen,
    )


def _rate(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None
