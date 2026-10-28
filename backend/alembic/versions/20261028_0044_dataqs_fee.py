"""dataqs fee: the $50 DataQs filing fee invoice on a case

Revision ID: 0044
Revises: 0043
Create Date: 2026-10-28 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0044"
down_revision: str | None = "0043"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dataqs_cases", sa.Column("fee_invoice_id", sa.BigInteger()))
    op.create_foreign_key(
        op.f("fk_dataqs_cases_fee_invoice_id_invoices"),
        "dataqs_cases",
        "invoices",
        ["fee_invoice_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_dataqs_cases_fee_invoice_id_invoices"), "dataqs_cases", type_="foreignkey"
    )
    op.drop_column("dataqs_cases", "fee_invoice_id")
