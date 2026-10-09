"""Intelligence signals for one carrier, each with its evidence (spec Sections 12, 13)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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
    reviewed_at: datetime | None
    review_note: str | None
    evidence: list[EvidenceOut]


class CarrierSignalsOut(BaseModel):
    usdot_number: int
    signals: list[SignalOut]  # highest severity first


class SignalReviewIn(BaseModel):
    """A reviewer's decision. OPEN reopens the signal and clears the note."""

    status: Literal["OPEN", "REVIEWED", "DISMISSED"]
    note: str | None = Field(default=None, max_length=2000)
