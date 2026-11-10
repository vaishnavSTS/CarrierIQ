"""account activity: what each person searched and which carrier tabs they opened

Adds the carrier (USDOT) and the carrier page tab to account_events, for the new SEARCHED and
CARRIER_VIEWED entries in each account's history.

Revision ID: 0057
Revises: 0056
Create Date: 2026-11-10 15:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0057"
down_revision: str | None = "0056"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("account_events", sa.Column("usdot_number", sa.BigInteger(), nullable=True))
    op.add_column("account_events", sa.Column("page", sa.String(40), nullable=True))


def downgrade() -> None:
    op.drop_column("account_events", "page")
    op.drop_column("account_events", "usdot_number")
