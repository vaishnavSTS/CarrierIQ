"""Initial migration: enable PostgreSQL extensions used by the platform.

Tables are added in Phase 2 (carrier data model).

Revision ID: 0001
Revises:
Create Date: 2026-10-08
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Trigram indexes for fuzzy carrier name search (Section 17).
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
