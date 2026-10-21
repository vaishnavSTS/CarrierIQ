"""dataqs review cycle appeals: why a review cycle opened, and an appeal's grounds and issues

(docs/DataQ.md, Phase 5.) Three nullable columns on dataqs_review_cycles; no data changes.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-21 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "dataqs_review_cycles", sa.Column("opened_reason", sa.String(length=200), nullable=True)
    )
    op.add_column("dataqs_review_cycles", sa.Column("grounds", sa.Text(), nullable=True))
    op.add_column(
        "dataqs_review_cycles",
        sa.Column("appealed_issue_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("dataqs_review_cycles", "appealed_issue_ids")
    op.drop_column("dataqs_review_cycles", "grounds")
    op.drop_column("dataqs_review_cycles", "opened_reason")
