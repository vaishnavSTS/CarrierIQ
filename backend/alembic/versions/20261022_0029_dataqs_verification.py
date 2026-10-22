"""dataqs verification: whether FMCSA's data shows each approved correction (Phase 6)

New columns on dataqs_issues (verification_status, verification_note, verified_at,
verified_by_id, shown_at) and the dataqs_verification_checks table. Issues already corrected
start waiting to be seen (driver details: STS confirms by hand).

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-22 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STATUSES = ("WAITING", "VERIFIED", "REVIEW", "MANUAL")


def upgrade() -> None:
    allowed = ", ".join(f"'{v}'" for v in STATUSES)
    op.add_column(
        "dataqs_issues",
        sa.Column("verification_status", sa.String(length=20), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_dataqs_issues_dataqs_verification_status"),
        "dataqs_issues",
        f"verification_status IN ({allowed})",
    )
    op.add_column("dataqs_issues", sa.Column("verification_note", sa.Text(), nullable=True))
    op.add_column(
        "dataqs_issues", sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("dataqs_issues", sa.Column("verified_by_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        op.f("fk_dataqs_issues_verified_by_id_users"),
        "dataqs_issues",
        "users",
        ["verified_by_id"],
        ["id"],
    )
    op.add_column("dataqs_issues", sa.Column("shown_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "UPDATE dataqs_issues SET verification_status = CASE WHEN reason = 'DRIVER_INCORRECT' "
        "THEN 'MANUAL' ELSE 'WAITING' END WHERE outcome = 'FULL_CORRECTION'"
    )

    op.create_table(
        "dataqs_verification_checks",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("found", sa.Boolean(), nullable=True),
        sa.Column("usdot_number", sa.BigInteger(), nullable=True),
        sa.Column("record", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("changes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_verification_checks_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_verification_checks")),
    )
    op.create_index(
        op.f("ix_dataqs_verification_checks_case_id"),
        "dataqs_verification_checks",
        ["case_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_dataqs_verification_checks_case_id"), table_name="dataqs_verification_checks"
    )
    op.drop_table("dataqs_verification_checks")
    op.drop_column("dataqs_issues", "shown_at")
    op.drop_constraint(
        op.f("fk_dataqs_issues_verified_by_id_users"), "dataqs_issues", type_="foreignkey"
    )
    op.drop_column("dataqs_issues", "verified_by_id")
    op.drop_column("dataqs_issues", "verified_at")
    op.drop_column("dataqs_issues", "verification_note")
    op.drop_constraint(
        op.f("ck_dataqs_issues_dataqs_verification_status"), "dataqs_issues", type_="check"
    )
    op.drop_column("dataqs_issues", "verification_status")
