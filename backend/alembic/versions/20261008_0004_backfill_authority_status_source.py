"""Backfill authority.status_source for dockets created before migration 0003.

Their status came from the census, so label it CENSUS, dated by the carrier's last refresh.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-08
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE authority AS a
        SET status_source = 'CENSUS',
            status_as_of = c.last_refreshed_at::date
        FROM carriers AS c
        WHERE a.carrier_id = c.id
          AND a.status_source IS NULL
          AND a.status IS NOT NULL
        """
    )


def downgrade() -> None:
    # The backfilled labels are indistinguishable from later census writes; nothing to undo.
    pass
