"""dataqs attempt note: why a DataQs filing attempt was left unconfirmed or abandoned

(docs/DataQ.md, Phase 4.) One nullable column; no data changes.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-21 16:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dataqs_submission_attempts", sa.Column("note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("dataqs_submission_attempts", "note")
