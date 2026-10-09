"""sms violations: FMCSA's SMS input violations with their weights

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-09 22:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sms_violations",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("carrier_id", sa.BigInteger(), nullable=False),
        sa.Column("inspection_id", sa.String(length=30), nullable=False),
        sa.Column("inspection_date", sa.Date(), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("basic", sa.String(length=60), nullable=False),
        sa.Column("group", sa.String(length=100), nullable=True),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("unit", sa.String(length=5), nullable=True),
        sa.Column("out_of_service", sa.Boolean(), nullable=False),
        sa.Column("severity_weight", sa.Integer(), nullable=False),
        sa.Column("time_weight", sa.Integer(), nullable=False),
        sa.Column("total_weight", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("raw_record_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["carrier_id"],
            ["carriers.id"],
            name=op.f("fk_sms_violations_carrier_id_carriers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["raw_record_id"],
            ["raw_records.id"],
            name=op.f("fk_sms_violations_raw_record_id_raw_records"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sms_violations")),
    )
    op.create_index(op.f("ix_sms_violations_carrier_id"), "sms_violations", ["carrier_id"])
    op.create_index(op.f("ix_sms_violations_raw_record_id"), "sms_violations", ["raw_record_id"])


def downgrade() -> None:
    op.drop_table("sms_violations")
