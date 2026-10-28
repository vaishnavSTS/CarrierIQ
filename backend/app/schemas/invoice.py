"""CarrierSafetyScan invoices (paid through Stripe)."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel

from app.models.enums import InvoiceStatus


class InvoiceSummaryOut(BaseModel):
    id: int
    number: int
    status: InvoiceStatus
    organization_name: str | None
    usdot_number: int | None
    billed_to: str
    total: Decimal
    issued_at: datetime
    paid_at: datetime | None
    voided_at: datetime | None
    refunded_at: datetime | None


class InvoiceLineOut(BaseModel):
    position: int
    item: str
    description: str
    quantity: int
    rate: Decimal
    amount: Decimal


class InvoiceOut(InvoiceSummaryOut):
    """Everything printed on the invoice."""

    issuer: dict[str, str]  # From: name, street, city_state_zip, phone, email
    bill_to: dict[str, Any]  # To: name, street, city_state_zip, phone, emails (list)
    lines: list[InvoiceLineOut]
    dispute_policy: str
    can_pay: bool  # a client, and it's unpaid
    can_void: bool  # STS staff, and it's unpaid


class InvoiceListOut(BaseModel):
    invoices: list[InvoiceSummaryOut]


class InvoicePayOut(BaseModel):
    url: str  # Stripe Checkout
