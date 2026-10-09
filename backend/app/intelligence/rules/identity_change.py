"""Identity change (spec Section 12.4): legal name, DBA, email, addresses, phones, officers and
web domains that changed in the last two years, with before and after values.

Sources are the census history kept by CarrierIQ: `carrier_attribute_history` for single values,
and the observed-period tables (addresses, phones, officers, domains) for the rest. The census
file has no change dates, so the date is the day CarrierIQ first saw the new value. A carrier's
first load is not a change: only a value that replaced an earlier one is.

Confidence (spec 13.1): HIGH — the census records show both values. Severity: legal name
MEDIUM; DBA, email, physical address, phone and officers LOW; mailing address and web domain
INFO. Changes are normal for real businesses (moves, new phone numbers); this records them for
review, never as a judgement.
"""

from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import TypeVar

from sqlalchemy import select

from app.core.config import get_settings
from app.intelligence.base_rule import EvidenceValues, Rule, RuleContext, SignalValues, at_day
from app.models import Address, CarrierAttributeHistory, Domain, Officer, Phone
from app.models.enums import Confidence, Severity

SIGNAL_TYPE = "IDENTITY_CHANGE"

ObservedRow = TypeVar("ObservedRow", Address, Phone, Officer, Domain)

# attribute -> (label, severity)
_ATTRIBUTES = {
    "legal_name": ("Legal name", Severity.MEDIUM),
    "dba_name": ("DBA name", Severity.LOW),
    "email": ("Email", Severity.LOW),
}


@dataclass(frozen=True)
class _Group:
    """One kind of observed value whose current set is compared with the set it replaced."""

    key: str
    label: str
    severity: Severity
    entity_type: str
    rows: Sequence[Address | Phone | Officer | Domain]
    show: Callable[[Address | Phone | Officer | Domain], str]


def _address(row: Address | Phone | Officer | Domain) -> str:
    assert isinstance(row, Address)
    parts = [row.street, row.city, " ".join(p for p in (row.state, row.zip) if p)]
    return ", ".join(p for p in parts if p) or "(blank)"


def _phone(row: Address | Phone | Officer | Domain) -> str:
    assert isinstance(row, Phone)
    digits = row.number_normalized
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}" if len(digits) == 10 else digits


def _officer(row: Address | Phone | Officer | Domain) -> str:
    assert isinstance(row, Officer)
    return f"{row.name} ({row.title})" if row.title else row.name


def _domain(row: Address | Phone | Officer | Domain) -> str:
    assert isinstance(row, Domain)
    return row.domain


def _value(value: str | None) -> str:
    return value if value else "(none)"


class IdentityChangeRule(Rule):
    rule_id = "identity_change"
    rule_version = "1.0"

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        since = context.today - timedelta(days=get_settings().signal_lookback_days)
        return self._attribute_changes(context, since) + self._observed_changes(context, since)

    def _attribute_changes(self, context: RuleContext, since: date) -> list[SignalValues]:
        rows = context.db.scalars(
            select(CarrierAttributeHistory)
            .where(
                CarrierAttributeHistory.carrier_id == context.carrier.id,
                CarrierAttributeHistory.attribute.in_(_ATTRIBUTES),
            )
            .order_by(CarrierAttributeHistory.valid_from, CarrierAttributeHistory.id)
        )
        by_attribute: dict[str, list[CarrierAttributeHistory]] = defaultdict(list)
        for row in rows:
            by_attribute[row.attribute].append(row)

        signals = []
        for attribute, history in by_attribute.items():
            label, severity = _ATTRIBUTES[attribute]
            for before, after in zip(history, history[1:], strict=False):
                if after.valid_from < since:
                    continue
                day = after.valid_from
                signals.append(
                    SignalValues(
                        signal_key=f"{self.rule_id}:{attribute}:{day.isoformat()}",
                        signal_type=SIGNAL_TYPE,
                        severity=severity,
                        confidence=Confidence.HIGH,
                        title=f"{label} changed",
                        description=(
                            f"{label} changed from {_value(before.value)} to "
                            f"{_value(after.value)}, first seen by CarrierIQ on "
                            f"{day.isoformat()} (the census file does not record when the change "
                            "was made). Based on FMCSA census records."
                        ),
                        evidence=(
                            _history_evidence(before, "Before"),
                            _history_evidence(after, "After"),
                        ),
                    )
                )
        return signals

    def _observed_changes(self, context: RuleContext, since: date) -> list[SignalValues]:
        carrier_id = context.carrier.id

        def rows(model: type[ObservedRow]) -> list[ObservedRow]:
            return list(
                context.db.scalars(
                    select(model).where(model.carrier_id == carrier_id).order_by(model.id)
                )
            )

        addresses = rows(Address)
        phones = rows(Phone)
        groups = [
            _Group(
                f"address:{t.value}",
                f"{t.value.capitalize()} address",
                Severity.LOW if t.value == "PHYSICAL" else Severity.INFO,
                "address",
                [a for a in addresses if a.address_type == t],
                _address,
            )
            for t in sorted({a.address_type for a in addresses})
        ]
        groups += [
            _Group(
                f"phone:{t.value}",
                f"{t.value.capitalize()} phone",
                Severity.LOW,
                "phone",
                [p for p in phones if p.phone_type == t],
                _phone,
            )
            for t in sorted({p.phone_type for p in phones})
        ]
        groups.append(
            _Group("officers", "Officers", Severity.LOW, "officer", rows(Officer), _officer)
        )
        groups.append(
            _Group("domain", "Web domain", Severity.INFO, "domain", rows(Domain), _domain)
        )

        signals = []
        for group in groups:
            current = [r for r in group.rows if r.is_current]
            if not current:
                continue
            changed_on = max(r.first_seen for r in current)
            # The set the current one replaced: values no longer current, seen until it appeared.
            replaced = [r for r in group.rows if not r.is_current and r.last_seen <= changed_on]
            added = [r for r in current if r.first_seen == changed_on]
            if changed_on < since or not replaced or not added:
                continue
            before = sorted({group.show(r) for r in replaced})
            after = sorted({group.show(r) for r in current})
            if before == after:
                continue
            signals.append(
                SignalValues(
                    signal_key=f"{self.rule_id}:{group.key}:{changed_on.isoformat()}",
                    signal_type=SIGNAL_TYPE,
                    severity=group.severity,
                    confidence=Confidence.HIGH,
                    title=f"{group.label} changed",
                    description=(
                        f"{group.label} changed from {'; '.join(before)} to {'; '.join(after)}, "
                        f"first seen by CarrierIQ on {changed_on.isoformat()} (the census file "
                        "does not record when the change was made). Based on FMCSA census records."
                    ),
                    evidence=tuple(
                        [_observed_evidence(r, group, "Before") for r in replaced]
                        + [_observed_evidence(r, group, "After") for r in added]
                    ),
                )
            )
        return signals


def _history_evidence(row: CarrierAttributeHistory, when: str) -> EvidenceValues:
    until = f" to {row.valid_to.isoformat()}" if row.valid_to else " (current)"
    return EvidenceValues(
        evidence_type="RECORD",
        entity_type="carrier_attribute_history",
        entity_id=row.id,
        raw_record_id=row.raw_record_id,
        field_name=row.attribute,
        observed_value=f"{when}: {_value(row.value)}, from {row.valid_from.isoformat()}{until}",
        observed_at=at_day(row.valid_from),
        source=row.source,
    )


def _observed_evidence(
    row: Address | Phone | Officer | Domain, group: _Group, when: str
) -> EvidenceValues:
    return EvidenceValues(
        evidence_type="RECORD",
        entity_type=group.entity_type,
        entity_id=row.id,
        raw_record_id=row.raw_record_id,
        field_name=group.key.split(":")[0],
        observed_value=(
            f"{when}: {group.show(row)}, seen {row.first_seen.isoformat()} to "
            f"{row.last_seen.isoformat()}"
        ),
        observed_at=at_day(row.first_seen),
        source=row.source,
    )
