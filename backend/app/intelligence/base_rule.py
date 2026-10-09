"""The interface every signal rule implements (spec Sections 12, 13).

A rule is deterministic: given a carrier's stored records it returns the signals it finds, each
with the evidence behind it. Rules never write; the signal service saves what they return.
Wording follows spec Section 14: describe what the records show, never a verdict.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, date, datetime, time

from sqlalchemy.orm import Session

from app.models import Carrier
from app.models.enums import Confidence, Severity


@dataclass(frozen=True)
class EvidenceValues:
    evidence_type: str  # RECORD | COMPARISON | THRESHOLD
    entity_type: str | None  # the record this points at, e.g. "relationship"
    entity_id: int | None
    raw_record_id: int | None
    field_name: str | None
    observed_value: str | None
    observed_at: datetime | None
    source: str | None


@dataclass(frozen=True)
class SignalValues:
    signal_key: str  # stable within the carrier, e.g. "shared_vin:888"
    signal_type: str
    severity: Severity
    confidence: Confidence
    title: str
    description: str
    evidence: tuple[EvidenceValues, ...]


@dataclass(frozen=True)
class RuleContext:
    db: Session
    carrier: Carrier
    today: date


class Rule(ABC):
    rule_id: str
    rule_version: str

    @abstractmethod
    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        """Every signal this rule finds for the carrier now."""


def at_day(day: date | None) -> datetime | None:
    """A source date as a timestamp for `observed_at` (midnight UTC)."""
    return datetime.combine(day, time(), tzinfo=UTC) if day else None
