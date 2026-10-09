"""Shared VIN (spec Section 12.3): equipment on this carrier's inspections also recorded on
inspections of another USDOT number.

One signal per other USDOT number, with one pair of evidence rows per shared VIN (where it was
seen with the other carrier, and with this one). This is a relationship signal, not a finding:
leased, rented or sold equipment legitimately moves between carriers.

Confidence (spec 13.1): HIGH when any shared VIN was seen under the other USDOT on 2+
inspections, or 2+ different VINs are shared; MEDIUM for a single VIN on a single inspection.
VINs whose check digit is invalid (NHTSA vPIC) are probably mistyped on a report, and a typo can
match another carrier's vehicle by chance: when every shared VIN is one of those, LOW.
Severity: LOW; MEDIUM when 3+ VINs are shared with the same carrier (a larger share of equipment).
"""

from collections import defaultdict

from app.intelligence.base_rule import EvidenceValues, Rule, RuleContext, SignalValues, at_day
from app.models import Relationship
from app.models.enums import Confidence, Severity
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.services.vehicle_observation_service import SOURCE, USDOT, VEHICLE, VIN_OBSERVED_WITH

SIGNAL_TYPE = "SHARED_VIN"
MANY_VINS = 3


def _seen(link: Relationship) -> str:
    n = link.observation_count
    span = (
        link.first_seen.isoformat()
        if link.first_seen == link.last_seen
        else f"{link.first_seen.isoformat()} to {link.last_seen.isoformat()}"
    )
    return f"{n} inspection{'s' if n != 1 else ''}, {span}"


def _evidence(link: Relationship, vin: str, whose: str, suspect: bool) -> EvidenceValues:
    note = " (check digit invalid: possibly mistyped)" if suspect else ""
    return EvidenceValues(
        evidence_type="RECORD",
        entity_type="relationship",
        entity_id=link.id,
        raw_record_id=link.raw_record_id,
        field_name="vin",
        observed_value=f"VIN {vin}{note} on {whose}: {_seen(link)}",
        observed_at=at_day(link.last_seen),
        source=SOURCE,
    )


class SharedVinRule(Rule):
    rule_id = "shared_vin"
    rule_version = "1.2"  # 1.2: description names its source

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        usdot = context.carrier.usdot_number
        relationships = RelationshipRepository(context.db)
        own = {
            link.source_entity_id: link
            for link in relationships.to_target(VIN_OBSERVED_WITH, (USDOT, usdot))
        }
        by_carrier: dict[int, list[Relationship]] = defaultdict(list)
        for link in relationships.from_sources(VIN_OBSERVED_WITH, VEHICLE, own):
            if link.target_entity_type == USDOT and link.target_entity_id != usdot:
                by_carrier[link.target_entity_id].append(link)
        if not by_carrier:
            return []
        vehicles = VehicleRepository(context.db).by_ids(own)
        vins = {i: v.vin for i, v in vehicles.items()}
        suspect = {i for i, v in vehicles.items() if v.check_digit_valid is False}
        names = CarrierRepository(context.db).legal_names(by_carrier)

        signals = []
        for other, links in sorted(by_carrier.items()):
            links.sort(key=lambda link: (link.last_seen, vins[link.source_entity_id]), reverse=True)
            name = names.get(other)
            who = f"USDOT {other}" + (f" ({name})" if name else "")
            count = len(links)
            first = min(link.first_seen for link in links)
            last = max(link.last_seen for link in links)
            repeated = any(link.observation_count >= 2 for link in links)
            if all(link.source_entity_id in suspect for link in links):
                confidence = Confidence.LOW
            elif repeated or count >= 2:
                confidence = Confidence.HIGH
            else:
                confidence = Confidence.MEDIUM
            period = (
                f"on {first.isoformat()}"
                if first == last
                else f"between {first.isoformat()} and {last.isoformat()}"
            )
            evidence: list[EvidenceValues] = []
            for link in links:
                vin = vins[link.source_entity_id]
                typo = link.source_entity_id in suspect
                evidence.append(_evidence(link, vin, f"inspections of {who}", typo))
                evidence.append(_evidence(own[link.source_entity_id], vin, "this carrier", typo))
            signals.append(
                SignalValues(
                    signal_key=f"{self.rule_id}:{other}",
                    signal_type=SIGNAL_TYPE,
                    severity=Severity.MEDIUM if count >= MANY_VINS else Severity.LOW,
                    confidence=confidence,
                    title=(
                        f"Potential shared equipment with {who}"
                        if count == 1
                        else f"Potential shared equipment with {who}: {count} VINs"
                    ),
                    description=(
                        "According to FMCSA inspection records, "
                        f"{count} VIN{'s' if count != 1 else ''} on this carrier's inspections "
                        f"{'were' if count != 1 else 'was'} also recorded on inspections of "
                        f"{who}{'' if name else ', a carrier not loaded in CarrierIQ'}, {period}. "
                        "The same equipment appears "
                        "associated with multiple carrier identities. Equipment legitimately "
                        "moves between carriers (leases, rentals, sales), so this is a "
                        "relationship to review, not a finding."
                    ),
                    evidence=tuple(evidence),
                )
            )
        return signals
