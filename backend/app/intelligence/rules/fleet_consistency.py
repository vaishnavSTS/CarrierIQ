"""Fleet consistency (spec Section 12.5): power units registered with FMCSA vs. power units seen
on inspections in the last 24 months (the same numbers as the Equipment tab).

Two signals:
- Limited inspection coverage: 5+ registered power units and fewer than a quarter of them seen.
  Few vehicles of any carrier are inspected, so this is context; it does not prove
  non-operation or misconduct (spec 12.5 wording).
- More power units seen than registered: at least 3 more. The registration (MCS-150) may be
  out of date, or vehicles leased or replaced.

Severity LOW. Confidence MEDIUM: inspections only ever show part of a fleet, and power units vs.
trailers are told apart from the NHTSA decode.
"""

from sqlalchemy import select

from app.intelligence.base_rule import EvidenceValues, Rule, RuleContext, SignalValues, at_day
from app.models import CarrierAttributeHistory
from app.models.enums import Confidence, Severity
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.carrier_equipment import FleetOut
from app.services.carrier_equipment_service import EquipmentReader

SIGNAL_TYPE = "FLEET_CONSISTENCY"
MIN_REGISTERED = 5
COVERAGE_SHARE = 0.25
MIN_EXCESS = 3


def _observed(fleet: FleetOut) -> EvidenceValues:
    unknown = (
        f"; {fleet.observed_unknown_type} without a decoded type"
        if fleet.observed_unknown_type
        else ""
    )
    return EvidenceValues(
        evidence_type="COMPARISON",
        entity_type=None,
        entity_id=None,
        raw_record_id=None,
        field_name="observed_power_units",
        observed_value=(
            f"{fleet.recent_power_units} power units seen on inspections in the last "
            f"{fleet.recent_months} months ({fleet.observed_power_units} ever, "
            f"{fleet.observed_trailers} trailers{unknown}); vehicles seen "
            f"{fleet.first_observed} to {fleet.last_observed}"
        ),
        observed_at=at_day(fleet.last_observed),
        source="dot_socrata",
    )


class FleetConsistencyRule(Rule):
    rule_id = "fleet_consistency"
    rule_version = "1.0"

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        db = context.db
        reader = EquipmentReader(
            CarrierRepository(db), VehicleRepository(db), RelationshipRepository(db), context.today
        )
        fleet = reader.read(context.carrier).fleet
        registered = fleet.registered_power_units or 0
        recent = fleet.recent_power_units
        if fleet.observed_vehicles == 0:
            return []  # nothing inspected at all: nothing to compare

        census = db.scalars(
            select(CarrierAttributeHistory).where(
                CarrierAttributeHistory.carrier_id == context.carrier.id,
                CarrierAttributeHistory.attribute == "fleet_size",
                CarrierAttributeHistory.valid_to.is_(None),
            )
        ).one_or_none()
        registered_evidence = EvidenceValues(
            evidence_type="RECORD",
            entity_type="carrier_attribute_history" if census else "carrier",
            entity_id=census.id if census else context.carrier.id,
            raw_record_id=census.raw_record_id if census else None,
            field_name="fleet_size",
            observed_value=f"{registered} power units registered (census, as reported on MCS-150)",
            observed_at=at_day(census.valid_from) if census else None,
            source=census.source if census else None,
        )
        months = fleet.recent_months

        if registered >= MIN_REGISTERED and recent < registered * COVERAGE_SHARE:
            share = f"{COVERAGE_SHARE:.0%}"
            return [
                SignalValues(
                    signal_key=f"{self.rule_id}:limited_coverage",
                    signal_type=SIGNAL_TYPE,
                    severity=Severity.LOW,
                    confidence=Confidence.MEDIUM,
                    title="Fleet consistency requires review: limited inspection coverage",
                    description=(
                        f"Registered power units: {registered}. Power units seen on inspections "
                        f"in the last {months} months: {recent}. Inspection coverage is limited "
                        "relative to the registered fleet. This does not prove non-operation or "
                        "misconduct: only some vehicles of any carrier are inspected."
                    ),
                    evidence=(
                        registered_evidence,
                        _observed(fleet),
                        EvidenceValues(
                            evidence_type="THRESHOLD",
                            entity_type=None,
                            entity_id=None,
                            raw_record_id=None,
                            field_name="coverage",
                            observed_value=(
                                f"Rule: {MIN_REGISTERED}+ registered power units and fewer than "
                                f"{share} of them seen in {months} months ({recent} of "
                                f"{registered} = {recent / registered:.0%})"
                            ),
                            observed_at=None,
                            source=None,
                        ),
                    ),
                )
            ]
        if recent >= registered + MIN_EXCESS:
            return [
                SignalValues(
                    signal_key=f"{self.rule_id}:more_than_registered",
                    signal_type=SIGNAL_TYPE,
                    severity=Severity.LOW,
                    confidence=Confidence.MEDIUM,
                    title=(
                        "Fleet consistency requires review: more power units seen than registered"
                    ),
                    description=(
                        f"Registered power units: {registered}. Power units seen on inspections "
                        f"in the last {months} months: {recent}. The registration (MCS-150) may be "
                        "out of date, or vehicles may be leased or replaced. Requires review."
                    ),
                    evidence=(
                        registered_evidence,
                        _observed(fleet),
                        EvidenceValues(
                            evidence_type="THRESHOLD",
                            entity_type=None,
                            entity_id=None,
                            raw_record_id=None,
                            field_name="excess",
                            observed_value=(
                                f"Rule: at least {MIN_EXCESS} more power units seen in {months} "
                                f"months than registered ({recent} vs. {registered})"
                            ),
                            observed_at=None,
                            source=None,
                        ),
                    ),
                )
            ]
        return []
