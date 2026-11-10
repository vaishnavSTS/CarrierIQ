"""authority kinds: each kind of authority under a docket with its own status

Old L&I: common carrier, contract carrier and broker authority; Motus: each authority type (Motus
lists them as separate rows under one docket). Empty for dockets loaded before this; the carrier
authority answer then reads them from the docket's stored FMCSA row.

Revision ID: 0056
Revises: 0055
Create Date: 2026-11-10 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0056"
down_revision: str | None = "0055"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("authority", sa.Column("kinds", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("authority", "kinds")
