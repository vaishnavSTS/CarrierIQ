"""insurance reminders: emails sent before a policy's estimated end, and who unsubscribed

Revision ID: 0058
Revises: 0057
Create Date: 2026-11-12 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0058"
down_revision: str | None = "0057"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "insurance_reminders",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "insurance_id",
            sa.BigInteger(),
            sa.ForeignKey("insurance.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("days_before", sa.Integer(), nullable=False),
        sa.Column("recipient", sa.String(254), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "insurance_id",
            "end_date",
            "days_before",
            "recipient",
            name="uq_insurance_reminders_once",
        ),
    )
    op.create_index("ix_insurance_reminders_insurance_id", "insurance_reminders", ["insurance_id"])
    op.create_index("ix_insurance_reminders_usdot_number", "insurance_reminders", ["usdot_number"])
    op.create_table(
        "insurance_reminder_opt_outs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("email_hash", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("insurance_reminder_opt_outs")
    op.drop_index("ix_insurance_reminders_usdot_number", table_name="insurance_reminders")
    op.drop_index("ix_insurance_reminders_insurance_id", table_name="insurance_reminders")
    op.drop_table("insurance_reminders")
