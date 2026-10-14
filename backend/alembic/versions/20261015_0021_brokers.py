"""brokers: BROKER organizations and roles, and a brokerage's FMCSA identity

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-15 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS_BEFORE = ("STS", "CLIENT")
KINDS_AFTER = (*KINDS_BEFORE, "BROKER")
ROLES_BEFORE = ("STS_ADMIN", "STS_ANALYST", "CLIENT_ADMIN", "CLIENT_USER")
ROLES_AFTER = (*ROLES_BEFORE, "BROKER_ADMIN", "BROKER_USER")


def _check(table: str, name: str, column: str, values: Sequence[str]) -> None:
    allowed = ", ".join(f"'{v}'" for v in values)
    op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
    op.create_check_constraint(op.f(f"ck_{table}_{name}"), table, f"{column} IN ({allowed})")


def upgrade() -> None:
    _check("organizations", "organization_kind", "kind", KINDS_AFTER)
    _check("users", "user_role", "role", ROLES_AFTER)
    op.add_column("organizations", sa.Column("usdot_number", sa.Integer(), nullable=True))
    op.add_column("organizations", sa.Column("docket_number", sa.String(length=12), nullable=True))
    op.add_column(
        "organizations", sa.Column("authority_source", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "organizations",
        sa.Column("authority_checked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "authority_checked_at")
    op.drop_column("organizations", "authority_source")
    op.drop_column("organizations", "docket_number")
    op.drop_column("organizations", "usdot_number")
    _check("users", "user_role", "role", ROLES_BEFORE)
    _check("organizations", "organization_kind", "kind", KINDS_BEFORE)
