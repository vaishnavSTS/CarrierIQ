"""The Compliance tab: UCR status and clients' service requests to STS."""

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import ComplianceRequestStatus, ComplianceService


class UcrYearOut(BaseModel):
    year: int
    fee_paid: bool
    updated: date | None


class UcrStatusOut(BaseModel):
    """From FMCSA's SAFER UCR query. None in registered_*: could not check (see error)."""

    usdot_number: int
    current_year: int
    registered_current: bool | None
    next_year: int | None  # next year's registration is open (from October 1)
    registered_next: bool | None
    years: list[UcrYearOut]
    checked_at: datetime | None
    error: str | None
    source_url: str


class ComplianceRequestIn(BaseModel):
    service: ComplianceService
    note: str | None = Field(default=None, max_length=2000)


class ComplianceRequestOut(BaseModel):
    id: int
    usdot_number: int
    service: ComplianceService
    service_label: str
    note: str | None
    status: ComplianceRequestStatus
    organization_name: str | None
    requested_by_name: str | None
    requested_by_email: str | None
    requested_by_phone: str | None
    created_at: datetime
    handled_by_name: str | None
    handled_at: datetime | None
    email_error: str | None  # the email to STS failed (staff)


class ComplianceRequestListOut(BaseModel):
    requests: list[ComplianceRequestOut]
