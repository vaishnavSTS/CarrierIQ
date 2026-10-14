"""iss references: monthly Estimated ISS lookup tables

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-14 16:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "iss_references",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("data_month", sa.Date(), nullable=False),
        sa.Column("version", sa.String(length=20), nullable=False),
        sa.Column("dataset_id", sa.String(length=20), nullable=False),
        sa.Column("carriers", sa.Integer(), nullable=False),
        sa.Column("tables", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_iss_references")),
        sa.UniqueConstraint("data_month", name=op.f("uq_iss_references_data_month")),
    )


def downgrade() -> None:
    op.drop_table("iss_references")
