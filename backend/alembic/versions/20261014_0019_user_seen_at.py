"""user seen_at: when STS saw a new sign-up (sign-ups no longer wait for approval)

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-14 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("seen_at", sa.DateTime(timezone=True), nullable=True))
    # Accounts that exist already are not "new": only sign-ups from now on raise the pop-up.
    op.execute("UPDATE users SET seen_at = now()")


def downgrade() -> None:
    op.drop_column("users", "seen_at")
