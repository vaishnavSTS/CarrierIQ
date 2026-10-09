"""Intelligence signals for one carrier, each with its evidence (spec Sections 12, 13)."""

from datetime import datetime

from pydantic import BaseModel


class EvidenceOut(BaseModel):
    evidence_type: str  # RECORD | COMPARISON | THRESHOLD
    entity_type: str | None
    entity_id: int | None
    raw_record_id: int | None  # the stored source row behind it
    field_name: str | None
    observed_value: str | None
    observed_at: datetime | None
    source: str | None


class SignalOut(BaseModel):
    id: int
    signal_type: str
    rule_id: str
    rule_version: str
    severity: str  # INFO | LOW | MEDIUM | HIGH
    confidence: str  # HIGH | MEDIUM | LOW
    status: str  # OPEN | REVIEWED | DISMISSED
    title: str
    description: str | None
    first_detected_at: datetime | None
    last_detected_at: datetime | None
    evidence: list[EvidenceOut]


class CarrierSignalsOut(BaseModel):
    usdot_number: int
    signals: list[SignalOut]  # highest severity first
