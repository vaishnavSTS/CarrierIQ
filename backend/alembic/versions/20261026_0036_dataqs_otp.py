"""dataqs otp: how the carrier gives STS the FMCSA login code, and each text or call asking for it

Revision ID: 0036
Revises: 0035
Create Date: 2026-10-26 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0036"
down_revision: str | None = "0035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OTP_METHODS = ("TEXT", "AI_CALL", "SCHEDULED_CALL")


def _enum(*values: str, name: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=20)


def upgrade() -> None:
    op.add_column(
        "dataqs_cases", sa.Column("otp_method", _enum(*OTP_METHODS, name="dataqs_otp_method"))
    )
    op.add_column("dataqs_cases", sa.Column("otp_phone", sa.String(length=20), nullable=True))
    op.add_column(
        "dataqs_cases", sa.Column("otp_call_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "dataqs_cases",
        sa.Column("otp_preference_set_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "dataqs_otp_requests",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("method", _enum(*OTP_METHODS, name="dataqs_otp_request_method"), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column(
            "status",
            _enum("SENT", "RECEIVED", "USED", "EXPIRED", "FAILED", name="dataqs_otp_status"),
            nullable=False,
        ),
        sa.Column("requested_by_id", sa.BigInteger(), nullable=False),
        sa.Column("provider_sid", sa.String(length=64), nullable=True),
        sa.Column("code", sa.String(length=12), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
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
            name=op.f("fk_dataqs_otp_requests_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_id"],
            ["users.id"],
            name=op.f("fk_dataqs_otp_requests_requested_by_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_otp_requests")),
    )
    op.create_index(
        op.f("ix_dataqs_otp_requests_case_id"), "dataqs_otp_requests", ["case_id"], unique=False
    )
    op.create_index(
        op.f("ix_dataqs_otp_requests_expires_at"),
        "dataqs_otp_requests",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dataqs_otp_requests_expires_at"), table_name="dataqs_otp_requests")
    op.drop_index(op.f("ix_dataqs_otp_requests_case_id"), table_name="dataqs_otp_requests")
    op.drop_table("dataqs_otp_requests")
    op.drop_column("dataqs_cases", "otp_preference_set_at")
    op.drop_column("dataqs_cases", "otp_call_at")
    op.drop_column("dataqs_cases", "otp_phone")
    op.drop_column("dataqs_cases", "otp_method")
