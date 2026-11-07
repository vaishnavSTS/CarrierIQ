"""monitored carriers: USDOT numbers STS admins monitor (Admin Monitored DOTs tab)

Revision ID: 0054
Revises: 0053
Create Date: 2026-11-06 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0054"
down_revision: str | None = "0053"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "monitored_carriers",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False, unique=True),
        sa.Column(
            "added_by_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("monitored_carriers")
