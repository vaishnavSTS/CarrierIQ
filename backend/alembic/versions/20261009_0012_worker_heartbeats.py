"""worker heartbeats

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-09 11:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "worker_heartbeats",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("worker", sa.String(length=100), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_worker_heartbeats")),
        sa.UniqueConstraint("worker", name=op.f("uq_worker_heartbeats_worker")),
    )


def downgrade() -> None:
    op.drop_table("worker_heartbeats")
