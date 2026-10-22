"""dataqs carrier contacts: drop "best time to call" (STS asks only for the email and phone)

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-22 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("dataqs_carrier_contacts", "best_time")


def downgrade() -> None:
    op.add_column(
        "dataqs_carrier_contacts",
        sa.Column("best_time", sa.String(length=100), nullable=True),
    )
