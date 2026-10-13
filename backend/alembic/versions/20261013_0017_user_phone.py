"""user phone: clients give a mobile number at sign-up

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-13 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable: STS staff accounts and sign-ups made before this have no phone.
    op.add_column("users", sa.Column("phone", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "phone")
