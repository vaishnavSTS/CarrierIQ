"""try uses: each Try Now visitor's one search, kept for good

Revision ID: 0048
Revises: 0047
Create Date: 2026-10-30 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0048"
down_revision: str | None = "0047"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "try_uses",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("visitor_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("try_uses")
