"""invoice usdot optional: a brokerage's subscription invoice may have no USDOT number

Revision ID: 0046
Revises: 0045
Create Date: 2026-10-29 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0046"
down_revision: str | None = "0045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("invoices", "usdot_number", existing_type=sa.BigInteger(), nullable=True)


def downgrade() -> None:
    op.alter_column("invoices", "usdot_number", existing_type=sa.BigInteger(), nullable=False)
