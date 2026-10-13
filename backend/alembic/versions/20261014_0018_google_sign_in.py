"""google sign-in: Google account id on users; password optional

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-14 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("google_sub", sa.String(length=64), nullable=True))
    op.create_unique_constraint(op.f("uq_users_google_sub"), "users", ["google_sub"])
    op.alter_column("users", "password_hash", existing_type=sa.String(length=300), nullable=True)


def downgrade() -> None:
    # Google-only accounts have no password and cannot survive the downgrade.
    op.execute("DELETE FROM users WHERE password_hash IS NULL")
    op.alter_column("users", "password_hash", existing_type=sa.String(length=300), nullable=False)
    op.drop_constraint(op.f("uq_users_google_sub"), "users", type_="unique")
    op.drop_column("users", "google_sub")
