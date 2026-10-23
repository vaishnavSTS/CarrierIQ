"""inspection report number: the reporting state's own number, which DataQs searches by

inspections.report_number, filled in from the FMCSA records already stored (raw_records holds each
inspection header as received). DataQs cases kept FMCSA's inspection id as their report number;
they get the state's number, where it is known. Packages already built keep what they froze.

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-22 19:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("inspections", sa.Column("report_number", sa.String(length=50), nullable=True))
    op.execute(
        """
        UPDATE inspections AS i
        SET report_number = NULLIF(TRIM(r.payload ->> 'report_number'), '')
        FROM raw_records AS r
        WHERE r.id = i.raw_record_id
        """
    )
    op.execute(
        """
        UPDATE dataqs_cases AS c
        SET inspection_report_number = i.report_number
        FROM inspections AS i
        JOIN carriers AS ca ON ca.id = i.carrier_id
        WHERE i.inspection_id = c.source_event_id
          AND ca.usdot_number = c.usdot_number
          AND i.report_number IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(
        "UPDATE dataqs_cases SET inspection_report_number = source_event_id "
        "WHERE event_type = 'INSPECTION'"
    )
    op.drop_column("inspections", "report_number")
