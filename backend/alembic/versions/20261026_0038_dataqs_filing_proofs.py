"""dataqs filing proofs: the confirmation DataQs gave when STS filed, uploaded on the attempt

Revision ID: 0038
Revises: 0037
Create Date: 2026-10-26 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0038"
down_revision: str | None = "0037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dataqs_filing_proofs",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("attempt_id", sa.BigInteger(), nullable=False),
        sa.Column("object_key", sa.String(length=500), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("uploaded_by_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_filing_proofs_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["dataqs_submission_attempts.id"],
            name=op.f("fk_dataqs_filing_proofs_attempt_id_dataqs_submission_attempts"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_id"],
            ["users.id"],
            name=op.f("fk_dataqs_filing_proofs_uploaded_by_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_filing_proofs")),
        sa.UniqueConstraint("object_key", name=op.f("uq_dataqs_filing_proofs_object_key")),
    )
    op.create_index(
        op.f("ix_dataqs_filing_proofs_case_id"), "dataqs_filing_proofs", ["case_id"], unique=False
    )
    op.create_index(
        op.f("ix_dataqs_filing_proofs_attempt_id"),
        "dataqs_filing_proofs",
        ["attempt_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dataqs_filing_proofs_attempt_id"), table_name="dataqs_filing_proofs")
    op.drop_index(op.f("ix_dataqs_filing_proofs_case_id"), table_name="dataqs_filing_proofs")
    op.drop_table("dataqs_filing_proofs")
