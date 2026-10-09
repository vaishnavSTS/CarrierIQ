"""Safety trend (spec Section 12.6): the carrier's own out-of-service rates over the last 12
months compared with the 12 months before, and inspections stopping.

No outside benchmark is used: the spec allows one only when validated benchmark data is
available, and CarrierIQ has none yet. A carrier is compared only with itself.

- OOS rate rose: both periods have 5+ inspections, and the vehicle (or driver) OOS rate rose by
  10+ percentage points to at least 1.5x the earlier rate. Severity LOW, MEDIUM for 20+ points.
- Inspections stopped: 5+ inspections in the earlier period, none in the last 12 months.
  Severity LOW: it may reflect reduced operations, a sale of the business, or simply chance.

Confidence (spec 13.1) grows with the evidence: HIGH when both periods have 20+ inspections,
MEDIUM with 10+, LOW otherwise.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from app.intelligence.base_rule import EvidenceValues, Rule, RuleContext, SignalValues, at_day
from app.models import Inspection
from app.models.enums import Confidence, Severity
from app.repositories.inspection_repository import InspectionRepository

SIGNAL_TYPE = "SAFETY_TREND"
PERIOD_DAYS = 365
MIN_INSPECTIONS = 5
MIN_RISE = 0.10  # rate points
BIG_RISE = 0.20
MIN_RATIO = 1.5
LISTED_OOS = 10  # recent out-of-service inspections listed as evidence


@dataclass(frozen=True)
class _Period:
    start: date
    end: date  # inclusive
    inspections: list[Inspection]

    def count(self, flag: Callable[[Inspection], bool]) -> int:
        return sum(1 for i in self.inspections if flag(i))

    def rate(self, flag: Callable[[Inspection], bool]) -> float:
        return self.count(flag) / len(self.inspections)

    def label(self) -> str:
        return f"{self.start.isoformat()} to {self.end.isoformat()}"


def _period(inspections: Sequence[Inspection], start: date, end: date) -> _Period:
    return _Period(start, end, [i for i in inspections if start <= i.inspection_date <= end])


def _confidence(*periods: _Period) -> Confidence:
    smallest = min(len(p.inspections) for p in periods)
    if smallest >= 20:
        return Confidence.HIGH
    return Confidence.MEDIUM if smallest >= 10 else Confidence.LOW


def _summary(period: _Period, name: str, flag: Callable[[Inspection], bool]) -> EvidenceValues:
    n = len(period.inspections)
    oos = period.count(flag)
    share = f" = {oos / n:.0%}" if n else ""
    return EvidenceValues(
        evidence_type="COMPARISON",
        entity_type=None,
        entity_id=None,
        raw_record_id=None,
        field_name=f"{name}_oos_rate",
        observed_value=(
            f"{period.label()}: {n} inspections, {oos} with {name} out of service{share}"
        ),
        observed_at=at_day(period.end),
        source="dot_socrata",
    )


def _inspection(inspection: Inspection, name: str) -> EvidenceValues:
    return EvidenceValues(
        evidence_type="RECORD",
        entity_type="inspection",
        entity_id=inspection.id,
        raw_record_id=inspection.raw_record_id,
        field_name=f"{name}_oos",
        observed_value=(
            f"Inspection {inspection.inspection_id} on {inspection.inspection_date.isoformat()}"
            f"{f' in {inspection.state}' if inspection.state else ''}: {name} out of service"
        ),
        observed_at=at_day(inspection.inspection_date),
        source=inspection.source,
    )


class SafetyTrendRule(Rule):
    rule_id = "safety_trend"
    rule_version = "1.0"

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        inspections = InspectionRepository(context.db).for_carrier(context.carrier.id)
        today = context.today
        recent = _period(inspections, today - timedelta(days=PERIOD_DAYS - 1), today)
        earlier = _period(
            inspections,
            today - timedelta(days=2 * PERIOD_DAYS - 1),
            today - timedelta(days=PERIOD_DAYS),
        )

        signals = [
            signal
            for name, flag in (
                ("vehicle", lambda i: i.vehicle_oos),
                ("driver", lambda i: i.driver_oos),
            )
            if (signal := self._rate_rise(name, flag, recent, earlier)) is not None
        ]
        if len(earlier.inspections) >= MIN_INSPECTIONS and not recent.inspections:
            last = earlier.inspections[-1]
            signals.append(
                SignalValues(
                    signal_key=f"{self.rule_id}:inspections_stopped",
                    signal_type=SIGNAL_TYPE,
                    severity=Severity.LOW,
                    confidence=Confidence.MEDIUM,
                    title="No inspections in the last 12 months",
                    description=(
                        f"{len(earlier.inspections)} inspections from {earlier.label()}, none "
                        f"since {last.inspection_date.isoformat()}. This may reflect reduced "
                        "operations or a change in the business; it does not show either on its "
                        "own. Based on FMCSA inspection records."
                    ),
                    evidence=(
                        EvidenceValues(
                            evidence_type="COMPARISON",
                            entity_type=None,
                            entity_id=None,
                            raw_record_id=None,
                            field_name="inspections",
                            observed_value=(
                                f"{earlier.label()}: {len(earlier.inspections)} inspections; "
                                f"{recent.label()}: none"
                            ),
                            observed_at=at_day(recent.end),
                            source="dot_socrata",
                        ),
                        EvidenceValues(
                            evidence_type="RECORD",
                            entity_type="inspection",
                            entity_id=last.id,
                            raw_record_id=last.raw_record_id,
                            field_name="inspection_date",
                            observed_value=(
                                f"Last inspection {last.inspection_id} on "
                                f"{last.inspection_date.isoformat()}"
                            ),
                            observed_at=at_day(last.inspection_date),
                            source=last.source,
                        ),
                    ),
                )
            )
        return signals

    def _rate_rise(
        self,
        name: str,
        flag: Callable[[Inspection], bool],
        recent: _Period,
        earlier: _Period,
    ) -> SignalValues | None:
        if min(len(recent.inspections), len(earlier.inspections)) < MIN_INSPECTIONS:
            return None
        now, before = recent.rate(flag), earlier.rate(flag)
        rise = round(now - before, 9)  # rounded: 0.3 - 0.2 is 0.0999... in floating point
        if rise < MIN_RISE or round(now, 9) < round(before * MIN_RATIO, 9):
            return None
        oos = [i for i in reversed(recent.inspections) if flag(i)][:LISTED_OOS]
        return SignalValues(
            signal_key=f"{self.rule_id}:{name}_oos_rose",
            signal_type=SIGNAL_TYPE,
            severity=Severity.MEDIUM if rise >= BIG_RISE else Severity.LOW,
            confidence=_confidence(recent, earlier),
            title=f"{name.capitalize()} out-of-service rate rose",
            description=(
                f"{name.capitalize()} out-of-service rate {now:.0%} over the last 12 months "
                f"({recent.count(flag)} of {len(recent.inspections)} inspections), up from "
                f"{before:.0%} in the 12 months before ({earlier.count(flag)} of "
                f"{len(earlier.inspections)}). Compared with the carrier's own history only; no "
                "industry benchmark is applied. Based on FMCSA inspection records."
            ),
            evidence=(
                _summary(recent, name, flag),
                _summary(earlier, name, flag),
                EvidenceValues(
                    evidence_type="THRESHOLD",
                    entity_type=None,
                    entity_id=None,
                    raw_record_id=None,
                    field_name=f"{name}_oos_rise",
                    observed_value=(
                        f"Rule: {MIN_INSPECTIONS}+ inspections in each period and a rise of "
                        f"{MIN_RISE:.0%}+ points to at least {MIN_RATIO}x the earlier rate "
                        f"(rose {rise * 100:.0f} points)"
                    ),
                    observed_at=None,
                    source=None,
                ),
                *(_inspection(i, name) for i in oos),
            ),
        )
