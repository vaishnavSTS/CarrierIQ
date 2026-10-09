"""signal identity: stable key, active flag, detection times

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-08 21:10:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "intelligence_signals", sa.Column("signal_key", sa.String(length=200), nullable=True)
    )
    op.add_column(
        "intelligence_signals",
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "intelligence_signals",
        sa.Column("first_detected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "intelligence_signals",
        sa.Column("last_detected_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        op.f("uq_intelligence_signals_carrier_key"),
        "intelligence_signals",
        ["carrier_id", "signal_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("uq_intelligence_signals_carrier_key"), "intelligence_signals", type_="unique"
    )
    op.drop_column("intelligence_signals", "last_detected_at")
    op.drop_column("intelligence_signals", "first_detected_at")
    op.drop_column("intelligence_signals", "is_active")
    op.drop_column("intelligence_signals", "signal_key")
