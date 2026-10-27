"""CarrierSafetyScan's own invoices (stored here, in Supabase Postgres), paid by card through Stripe
Checkout. A Compliance tab service the client pays for gets an invoice; Stripe's webhook marks it
paid (or refunded). Card details only ever go to Stripe.

Numbers come from the `invoice_number_seq` sequence, starting at 1001.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, Sequence, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import InvoiceStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin

INVOICE_NUMBERS = Sequence("invoice_number_seq", start=1001)


class Invoice(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "invoices"

    number: Mapped[int] = mapped_column(
        BigInteger, INVOICE_NUMBERS, server_default=INVOICE_NUMBERS.next_value(), unique=True
    )
    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), index=True
    )
    usdot_number: Mapped[int] = mapped_column(BigInteger, index=True)
    status: Mapped[InvoiceStatus] = mapped_column(
        enum_type(InvoiceStatus, "invoice_status"),
        default=InvoiceStatus.UNPAID,
        server_default=InvoiceStatus.UNPAID.value,
    )
    # Who it's billed to, as printed: name, street, city_state_zip, phone, emails (list).
    bill_to: Mapped[dict[str, Any]] = mapped_column(JSONB)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="usd", server_default="usd")
    created_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stripe_session_id: Mapped[str | None] = mapped_column(String(255), index=True)
    stripe_payment_intent: Mapped[str | None] = mapped_column(String(255), index=True)


class InvoiceLine(IdMixin, Base):
    __tablename__ = "invoice_lines"

    invoice_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("invoices.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)
    item: Mapped[str] = mapped_column(String(200))  # e.g. "UCR (3-5 TRUCKS)"
    description: Mapped[str] = mapped_column(String(500))  # e.g. "Service", "8 drivers"
    quantity: Mapped[int] = mapped_column(Integer)
    rate: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
