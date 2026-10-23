"""dataqs reasons and plates: DataQs's other two inspection reasons, and each inspection's plate

dataqs_issues.reason also allows COPY_REQUEST ("Did not receive a copy or lost the inspection") and
MISSING_INSPECTION ("Inspection missing from my report"). inspections.plate / plate_state: unit
1's plate, which DataQs can search by, filled in from the stored FMCSA unit records.

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-22 20:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REASONS_BEFORE = (
    "CITATION_OUTCOME",
    "VIOLATION_INCORRECT",
    "WRONG_CARRIER",
    "DRIVER_INCORRECT",
    "DUPLICATE_INSPECTION",
    "INCORRECT_INFORMATION",
    "UNSURE",
)
REASONS_AFTER = (*REASONS_BEFORE, "COPY_REQUEST", "MISSING_INSPECTION")


def _reasons(values: Sequence[str]) -> None:
    allowed = ", ".join(f"'{v}'" for v in values)
    op.drop_constraint(op.f("ck_dataqs_issues_dataqs_reason"), "dataqs_issues", type_="check")
    op.create_check_constraint(
        op.f("ck_dataqs_issues_dataqs_reason"), "dataqs_issues", f"reason IN ({allowed})"
    )


def upgrade() -> None:
    _reasons(REASONS_AFTER)
    op.add_column("inspections", sa.Column("plate", sa.String(length=20), nullable=True))
    op.add_column("inspections", sa.Column("plate_state", sa.String(length=10), nullable=True))
    # Unit rows are stored as received (newest last); unit 1 is the power unit.
    op.execute(
        """
        UPDATE inspections AS i
        SET plate = NULLIF(TRIM(u.plate), ''), plate_state = NULLIF(TRIM(u.plate_state), '')
        FROM (
            SELECT DISTINCT ON (payload ->> 'inspection_id')
                payload ->> 'inspection_id' AS inspection_id,
                payload ->> 'insp_unit_license' AS plate,
                payload ->> 'insp_unit_license_state' AS plate_state
            FROM raw_records
            WHERE payload ? 'insp_unit_id' AND payload ->> 'insp_unit_number' = '1'
            ORDER BY payload ->> 'inspection_id', id DESC
        ) AS u
        WHERE u.inspection_id = i.inspection_id
        """
    )


def downgrade() -> None:
    op.drop_column("inspections", "plate_state")
    op.drop_column("inspections", "plate")
    op.execute(
        "UPDATE dataqs_issues SET reason = 'UNSURE' "
        "WHERE reason IN ('COPY_REQUEST', 'MISSING_INSPECTION')"
    )
    _reasons(REASONS_BEFORE)
