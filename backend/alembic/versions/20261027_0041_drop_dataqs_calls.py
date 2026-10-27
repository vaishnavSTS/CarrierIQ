"""drop dataqs calls: calls with STS are booked on STS's website instead

The built-in call booking (0039) is replaced by a booking link to skytransportsolutions.com, which
sends its own confirmation, texts and reminders. Its table goes, and any texts still waiting to be
sent are cancelled.

Revision ID: 0041
Revises: 0040
Create Date: 2026-10-27 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0041"
down_revision: str | None = "0040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "UPDATE dataqs_outbox SET status = 'CANCELLED', updated_at = now() "
        "WHERE status = 'PENDING' AND channel <> 'EMAIL'"
    )
    op.drop_index(op.f("ix_dataqs_calls_starts_at"), table_name="dataqs_calls")
    op.drop_index(op.f("ix_dataqs_calls_case_id"), table_name="dataqs_calls")
    op.drop_table("dataqs_calls")


def downgrade() -> None:
    # The table comes back empty (as 0039 made it); the cancelled texts stay cancelled.
    op.create_table(
        "dataqs_calls",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("booked_by_id", sa.BigInteger(), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("time_zone", sa.String(length=64), nullable=False),
        sa.Column("topic", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "BOOKED",
                "CANCELLED",
                "DONE",
                name="dataqs_call_status",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="BOOKED",
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("handled_by_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_calls_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["booked_by_id"], ["users.id"], name=op.f("fk_dataqs_calls_booked_by_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["handled_by_id"], ["users.id"], name=op.f("fk_dataqs_calls_handled_by_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_calls")),
    )
    op.create_index(op.f("ix_dataqs_calls_case_id"), "dataqs_calls", ["case_id"], unique=False)
    op.create_index(op.f("ix_dataqs_calls_starts_at"), "dataqs_calls", ["starts_at"], unique=False)
