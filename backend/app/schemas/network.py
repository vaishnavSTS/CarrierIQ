"""Network & Identity tab: linked carriers, registration health and ownership events."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class SharedDetailOut(BaseModel):
    kind: str  # phone | email | address | building | officer
    value: str | None
    confidence: str
    first_seen: date
    last_seen: date


class LinkedCarrierOut(BaseModel):
    usdot_number: int
    legal_name: str | None
    status: str | None  # ACTIVE | INACTIVE (census status)
    registered: date | None
    city: str | None
    state: str | None
    shares: list[SharedDetailOut]  # strongest first
    signal_id: int | None  # the shared_contact signal, if one was raised


class CheckOut(BaseModel):
    key: str
    label: str
    status: str  # ok | attention | alert | info | unknown
    detail: str
    source: str
    as_of: date | None


class IdentityEventOut(BaseModel):
    id: int
    event_type: str
    event_date: date
    platform: str | None
    description: str | None
    supporting_document: str | None
    corrects_event_id: int | None
    corrected_by: list[int]  # ids of later corrections
    source: str
    entered_by: str | None
    created_at: datetime


class OwnershipStateOut(BaseModel):
    state: str  # NONE | ATTESTED | CONFLICTING | VERIFIED
    summary: str
    action: str | None


class NetworkOut(BaseModel):
    usdot_number: int
    linked_carriers: list[LinkedCarrierOut]  # strongest links first
    links_checked_at: datetime | None
    registration_checks: list[CheckOut]
    ownership: OwnershipStateOut
    identity_events: list[IdentityEventOut]  # oldest first


class IdentityEventIn(BaseModel):
    event_type: Literal[
        "OWNERSHIP_CHANGE_ATTESTED",
        "ATTESTATION_CORRECTED",
        "PLATFORM_ALERT",
        "OWNERSHIP_VERIFIED",
        "NOTE",
    ]
    event_date: date
    platform: str | None = Field(default=None, max_length=100)
    description: str = Field(min_length=1, max_length=2000)
    supporting_document: str | None = Field(default=None, max_length=500)
    corrects_event_id: int | None = None
    entered_by: str | None = Field(default=None, max_length=255)

    @field_validator("platform", "supporting_document", "entered_by")
    @classmethod
    def blank_is_none(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        return value or None

    @field_validator("description")
    @classmethod
    def trimmed(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Description is required")
        return value
