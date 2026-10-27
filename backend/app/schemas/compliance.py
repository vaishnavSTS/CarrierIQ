"""The Compliance tab: UCR status and clients' service requests to STS."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import ComplianceRequestStatus, ComplianceService, InvoiceStatus


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
    # Paid online: what was chosen, and its CarrierSafetyScan invoice.
    option_label: str | None = None
    quantity: int | None = None
    amount: Decimal | None = None
    invoice_id: int | None = None
    invoice_number: int | None = None
    invoice_status: InvoiceStatus | None = None
    # Requests from before (2026-10-27): the STS website's invoice.
    sts_invoice_no: int | None = None
    sts_payment_url: str | None = None


class PriceOptionOut(BaseModel):
    key: str
    label: str
    amount: Decimal  # per driver for driver files
    min_units: int
    max_units: int | None


class ServicePriceOut(BaseModel):
    """A service paid online, as offered for one carrier."""

    service: ComplianceService
    options: list[PriceOptionOut]
    per_driver: bool
    note: str | None
    too_big: str | None  # above the last option: contact STS
    suggested: str | None  # the option that fits the carrier's FMCSA fleet / driver count
    drivers: int | None  # FMCSA's driver count, to start from (driver files)


class CompliancePricesOut(BaseModel):
    services: list[ServicePriceOut]


class ComplianceCheckoutIn(BaseModel):
    service: ComplianceService
    option: str = Field(min_length=1, max_length=40)
    drivers: int | None = Field(default=None, ge=1, le=500)
    note: str | None = Field(default=None, max_length=2000)


class ComplianceCheckoutOut(BaseModel):
    payment_url: str  # Stripe Checkout
    request: "ComplianceRequestOut"


class ComplianceRequestListOut(BaseModel):
    requests: list[ComplianceRequestOut]
