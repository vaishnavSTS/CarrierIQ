"""compliance invoices: a service request paid online keeps its option and the website invoice

Revision ID: 0042
Revises: 0041
Create Date: 2026-10-27 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0042"
down_revision: str | None = "0041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = ("payment_url", "invoice_no", "invoice_id", "amount", "quantity", "option_key")


def upgrade() -> None:
    op.add_column("compliance_requests", sa.Column("option_key", sa.String(length=40)))
    op.add_column("compliance_requests", sa.Column("quantity", sa.Integer()))
    op.add_column("compliance_requests", sa.Column("amount", sa.Numeric(10, 2)))
    op.add_column("compliance_requests", sa.Column("invoice_id", sa.BigInteger()))
    op.add_column("compliance_requests", sa.Column("invoice_no", sa.BigInteger()))
    op.add_column("compliance_requests", sa.Column("payment_url", sa.Text()))


def downgrade() -> None:
    for column in COLUMNS:
        op.drop_column("compliance_requests", column)
