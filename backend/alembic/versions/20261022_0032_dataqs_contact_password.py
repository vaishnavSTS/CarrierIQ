"""store encrypted FMCSA passwords on DataQs carrier contacts

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-22 19:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "dataqs_carrier_contacts",
        sa.Column("password_encrypted", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("dataqs_carrier_contacts", "password_encrypted")
