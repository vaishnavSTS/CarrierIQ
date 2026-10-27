"""invoices: CarrierSafetyScan's own invoices, paid through Stripe

Service requests now point at an invoice here; the STS website invoice fields from 0042 are kept,
renamed sts_*, for the requests made before.

Revision ID: 0043
Revises: 0042
Create Date: 2026-10-27 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0043"
down_revision: str | None = "0042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RENAMED = (
    ("invoice_id", "sts_invoice_id"),
    ("invoice_no", "sts_invoice_no"),
    ("payment_url", "sts_payment_url"),
)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        )
    ]


def upgrade() -> None:
    op.execute("CREATE SEQUENCE invoice_number_seq START WITH 1001")
    op.create_table(
        "invoices",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column(
            "number",
            sa.BigInteger(),
            server_default=sa.text("nextval('invoice_number_seq')"),
            nullable=False,
        ),
        sa.Column("organization_id", sa.BigInteger(), nullable=False),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "UNPAID",
                "PAID",
                "VOID",
                "REFUNDED",
                name="invoice_status",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="UNPAID",
            nullable=False,
        ),
        sa.Column("bill_to", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="usd", nullable=False),
        sa.Column("created_by_id", sa.BigInteger(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_id", sa.BigInteger(), nullable=True),
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stripe_session_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_payment_intent", sa.String(length=255), nullable=True),
        *_timestamps(),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_invoices_organization_id_organizations"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], name=op.f("fk_invoices_created_by_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["voided_by_id"], ["users.id"], name=op.f("fk_invoices_voided_by_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoices")),
        sa.UniqueConstraint("number", name=op.f("uq_invoices_number")),
    )
    op.execute("ALTER SEQUENCE invoice_number_seq OWNED BY invoices.number")
    for column in ("organization_id", "usdot_number", "stripe_session_id", "stripe_payment_intent"):
        op.create_index(op.f(f"ix_invoices_{column}"), "invoices", [column], unique=False)

    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("invoice_id", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("item", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("rate", sa.Numeric(10, 2), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["invoice_id"],
            ["invoices.id"],
            name=op.f("fk_invoice_lines_invoice_id_invoices"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoice_lines")),
    )
    op.create_index(
        op.f("ix_invoice_lines_invoice_id"), "invoice_lines", ["invoice_id"], unique=False
    )

    for old, new in RENAMED:
        op.alter_column("compliance_requests", old, new_column_name=new)
    op.add_column("compliance_requests", sa.Column("invoice_id", sa.BigInteger()))
    op.create_foreign_key(
        op.f("fk_compliance_requests_invoice_id_invoices"),
        "compliance_requests",
        "invoices",
        ["invoice_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_compliance_requests_invoice_id"),
        "compliance_requests",
        ["invoice_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_compliance_requests_invoice_id"), table_name="compliance_requests")
    op.drop_constraint(
        op.f("fk_compliance_requests_invoice_id_invoices"),
        "compliance_requests",
        type_="foreignkey",
    )
    op.drop_column("compliance_requests", "invoice_id")
    for old, new in RENAMED:
        op.alter_column("compliance_requests", new, new_column_name=old)
    op.drop_index(op.f("ix_invoice_lines_invoice_id"), table_name="invoice_lines")
    op.drop_table("invoice_lines")
    for column in ("organization_id", "usdot_number", "stripe_session_id", "stripe_payment_intent"):
        op.drop_index(op.f(f"ix_invoices_{column}"), table_name="invoices")
    op.drop_table("invoices")  # drops invoice_number_seq with it (OWNED BY)
