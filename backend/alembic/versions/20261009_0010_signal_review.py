"""signal review: reviewed_at and review_note

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-09 09:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "intelligence_signals",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("intelligence_signals", sa.Column("review_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("intelligence_signals", "review_note")
    op.drop_column("intelligence_signals", "reviewed_at")
