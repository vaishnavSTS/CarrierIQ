"""dataqs assessments: STS staff assessments of DataQs cases (docs/DataQ.md, Phase 3)

One row per assessment: the checks, the outcome, a message the carrier sees and an internal note
for STS only. A new table; no existing table changes.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-21 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dataqs_assessments",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("assessor_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "outcome",
            sa.Enum(
                "READY_TO_PREPARE",
                "EVIDENCE_NEEDED",
                "PENDING_EXTERNAL",
                "SPECIALIST_REVIEW",
                "INSUFFICIENT_BASIS",
                name="dataqs_assessment_outcome",
                native_enum=False,
                create_constraint=True,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("checks", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("carrier_message", sa.Text(), nullable=True),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["assessor_id"], ["users.id"], name=op.f("fk_dataqs_assessments_assessor_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_assessments_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_assessments")),
    )
    op.create_index(
        op.f("ix_dataqs_assessments_case_id"), "dataqs_assessments", ["case_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dataqs_assessments_case_id"), table_name="dataqs_assessments")
    op.drop_table("dataqs_assessments")
