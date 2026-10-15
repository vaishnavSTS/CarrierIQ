"""iss snapshots: each carrier's Estimated ISS history

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-15 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "iss_snapshots",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("carrier_id", sa.BigInteger(), nullable=False),
        sa.Column("value", sa.SmallInteger(), nullable=True),
        sa.Column("band", sa.String(length=10), nullable=True),
        sa.Column("group", sa.SmallInteger(), nullable=True),
        sa.Column("algorithm", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("data_month", sa.Date(), nullable=False),
        sa.Column("version", sa.String(length=20), nullable=False),
        sa.Column("basics", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["carrier_id"],
            ["carriers.id"],
            name=op.f("fk_iss_snapshots_carrier_id_carriers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_iss_snapshots")),
    )
    op.create_index(
        "ix_iss_snapshots_carrier_id_created_at",
        "iss_snapshots",
        ["carrier_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_iss_snapshots_carrier_id_created_at", table_name="iss_snapshots")
    op.drop_table("iss_snapshots")
