"""insurance agents: a new account type, with the license number they give at sign-up

Revision ID: 0049
Revises: 0048
Create Date: 2026-10-30 20:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0049"
down_revision: str | None = "0048"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS_BEFORE = ("STS", "CLIENT", "BROKER")
KINDS_AFTER = (*KINDS_BEFORE, "INSURANCE")
ROLES_BEFORE = (
    "STS_ADMIN",
    "STS_ANALYST",
    "CLIENT_ADMIN",
    "CLIENT_USER",
    "BROKER_ADMIN",
    "BROKER_USER",
)
ROLES_AFTER = (*ROLES_BEFORE, "INSURANCE_AGENT")


def _check(table: str, name: str, column: str, values: Sequence[str]) -> None:
    allowed = ", ".join(f"'{v}'" for v in values)
    op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
    op.create_check_constraint(op.f(f"ck_{table}_{name}"), table, f"{column} IN ({allowed})")


def upgrade() -> None:
    _check("organizations", "organization_kind", "kind", KINDS_AFTER)
    _check("users", "user_role", "role", ROLES_AFTER)
    op.add_column("organizations", sa.Column("license_number", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "license_number")
    _check("users", "user_role", "role", ROLES_BEFORE)
    _check("organizations", "organization_kind", "kind", KINDS_BEFORE)
