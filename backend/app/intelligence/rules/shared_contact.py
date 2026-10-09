"""Shared contact details (spec Sections 11.4, 12.4, 29): another USDOT number with the same
phone, email, street address and unit, or officer name in the FMCSA census.

One signal per other carrier, from the links stored by services/contact_link_service.py; the
other carrier's census row is the evidence. Sharing only a building (another unit at the same
street address) is shown on the Network tab but is not a signal on its own.

Broker vetting tools flag shared contact details because related or reincarnated ("chameleon")
carriers often keep the same phone, email, address or people. There are also ordinary reasons:
family businesses, a shared office, or a dispatch or compliance service listing its own phone or
email for its clients. The wording says so; this is a relationship to review, never a finding.

Severity: MEDIUM for a shared phone or email, LOW for a shared address or officer; one level
higher (at most HIGH) when 2+ different details are shared with a carrier that is no longer
active. Confidence: HIGH for 2+ different details, MEDIUM for one; LOW when every shared value
appears on many carriers (most likely a service provider's).
"""

from collections import Counter, defaultdict
from datetime import date

from app.ingestion.contact_match import classify
from app.intelligence.base_rule import EvidenceValues, Rule, RuleContext, SignalValues, at_day
from app.models import RawRecord, Relationship
from app.models.enums import Confidence, Severity
from app.repositories.observed_value_repository import ObservedValueRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.services.contact_link_service import CONTACT_LINK_TYPES, LINK_TYPE, contact_keys
from app.services.vehicle_observation_service import USDOT

SIGNAL_TYPE = "SHARED_CONTACT"
MANY_CARRIERS = 5  # a value on this many other carriers is most likely a service provider's

LABEL = {
    LINK_TYPE["phone"]: "phone",
    LINK_TYPE["email"]: "email",
    LINK_TYPE["address"]: "address",
    LINK_TYPE["officer"]: "officer",
}
LEVELS = [Severity.LOW, Severity.MEDIUM, Severity.HIGH]


def _payload(link: Relationship, raws: dict[int, RawRecord]) -> dict[str, object]:
    raw = raws.get(link.raw_record_id or -1)
    return raw.payload if raw else {}


def _registered(payload: dict[str, object]) -> str:
    value = str(payload.get("add_date") or "")
    return f"{value[:4]}-{value[4:6]}-{value[6:8]}" if len(value) >= 8 else "unknown"


def _display(kind: str, value: str) -> str:
    if not value:
        return "(value not recorded)"
    if kind == "phone" and len(value) == 10:
        return f"({value[:3]}) {value[3:6]}-{value[6:]}"
    return value


def _spread_note(count: int) -> str:
    return f" (shared by {count} carriers)" if count > 1 else ""


class SharedContactRule(Rule):
    rule_id = "shared_contact"
    rule_version = "1.2"  # 1.2: neutral wording; 1.1: exact shared value in evidence

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        usdot = context.carrier.usdot_number
        strong_types = [t for t in CONTACT_LINK_TYPES if t in LABEL]
        links = RelationshipRepository(context.db).from_source((USDOT, usdot), strong_types)
        if not links:
            return []
        raw_ids = {link.raw_record_id for link in links if link.raw_record_id}
        raws = {r.id: r for r in context.db.query(RawRecord).filter(RawRecord.id.in_(raw_ids))}
        # Exactly which value is shared (a carrier may list an office phone, a cell and a fax).
        keys = contact_keys(context.carrier, ObservedValueRepository(context.db))

        by_carrier: dict[int, list[Relationship]] = defaultdict(list)
        values: dict[int, str] = {}
        for link in links:
            by_carrier[link.target_entity_id].append(link)
            kind = LABEL[link.relationship_type]
            values[link.id] = classify(_payload(link, raws), keys).values.get(kind, "")
        # How many other carriers share each exact value (a service provider's phone is on many).
        spread = Counter((link.relationship_type, values[link.id]) for link in links)

        signals = []
        for other, carrier_links in sorted(by_carrier.items()):
            carrier_links.sort(key=lambda link: CONTACT_LINK_TYPES.index(link.relationship_type))
            payload = _payload(carrier_links[0], raws)
            name = str(payload.get("legal_name") or "a carrier not in the census")
            active = payload.get("status_code") == "A"
            kinds = [LABEL[link.relationship_type] for link in carrier_links]
            common = all(
                spread[(link.relationship_type, values[link.id])] >= MANY_CARRIERS
                for link in carrier_links
            )
            strong = {"phone", "email"} & set(kinds)
            level = 1 if strong else 0
            if len(kinds) >= 2 and not active:
                level += 1
            severity = LEVELS[min(level, 2)]
            if common:
                confidence = Confidence.LOW
                severity = Severity.LOW
            elif len(kinds) >= 2:
                confidence = Confidence.HIGH
            else:
                confidence = Confidence.MEDIUM

            shared = (
                " and ".join(kinds)
                if len(kinds) <= 2
                else f"{', '.join(kinds[:-1])} and {kinds[-1]}"
            )
            status = "active" if active else "not active"
            note = (
                " The same value appears on many carriers, so it most likely belongs to a "
                "dispatch, compliance or filing service rather than to a related company."
                if common
                else ""
            )
            signals.append(
                SignalValues(
                    signal_key=f"{self.rule_id}:{other}",
                    signal_type=SIGNAL_TYPE,
                    severity=severity,
                    confidence=confidence,
                    title=f"Shares {shared} with USDOT {other} ({name})",
                    description=(
                        f"The FMCSA census lists the same {shared} for USDOT {other} ({name}, "
                        f"{status}, registered {_registered(payload)}). Some broker vetting tools "
                        "link carriers that share contact details and ask about the "
                        "relationship. Ordinary reasons include a family business, a shared "
                        "office, or a dispatch or compliance service listing its own contact "
                        f"details. A relationship to review, not a finding.{note}"
                    ),
                    evidence=tuple(
                        EvidenceValues(
                            evidence_type="RECORD",
                            entity_type="relationship",
                            entity_id=link.id,
                            raw_record_id=link.raw_record_id,
                            field_name=LABEL[link.relationship_type],
                            observed_value=(
                                f"Same {LABEL[link.relationship_type]} "
                                f"{_display(LABEL[link.relationship_type], values[link.id])} "
                                f"on USDOT {other}"
                                f"{_spread_note(spread[(link.relationship_type, values[link.id])])}"
                            ),
                            observed_at=at_day(link.last_seen or date.today()),
                            source="dot_socrata",
                        )
                        for link in carrier_links
                    ),
                )
            )
        return signals
