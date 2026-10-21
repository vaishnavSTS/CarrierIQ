"""dataqs match and messages: DataQs's own reasons, where the data was viewed, file titles, the
agency's "Opened" event, cancelled emails, and emails to carriers

(docs/DataQ.md.) Issue reasons move to DataQs's step-3 reasons; existing rows are mapped to the
nearest one. New: dataqs_cases.viewed_in, dataqs_evidence.title, the dataqs_messages table.

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-21 20:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REASONS_BEFORE = (
    "WRONG_ATTRIBUTION",
    "INACCURATE_VIOLATION",
    "DUPLICATE",
    "FIELD_CORRECTION",
    "COURT_OUTCOME",
    "UNSURE",
)
REASONS_AFTER = (
    "CITATION_OUTCOME",
    "VIOLATION_INCORRECT",
    "WRONG_CARRIER",
    "DRIVER_INCORRECT",
    "DUPLICATE_INSPECTION",
    "INCORRECT_INFORMATION",
    "UNSURE",
)
# Old reason -> the DataQs reason it now is.
REASON_MAP = {
    "WRONG_ATTRIBUTION": "WRONG_CARRIER",
    "INACCURATE_VIOLATION": "VIOLATION_INCORRECT",
    "DUPLICATE": "DUPLICATE_INSPECTION",
    "FIELD_CORRECTION": "INCORRECT_INFORMATION",
    "COURT_OUTCOME": "CITATION_OUTCOME",
}
KINDS_BEFORE = (
    "ACKNOWLEDGEMENT",
    "INFO_REQUEST",
    "INFO_RESPONSE",
    "DECISION",
    "REOPENING",
    "OTHER",
)
KINDS_AFTER = (*KINDS_BEFORE, "OPENED")
OUTBOX_BEFORE = ("PENDING", "SENT", "FAILED")
OUTBOX_AFTER = (*OUTBOX_BEFORE, "CANCELLED")


def _check(table: str, name: str, column: str, values: Sequence[str]) -> None:
    allowed = ", ".join(f"'{v}'" for v in values)
    op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
    op.create_check_constraint(op.f(f"ck_{table}_{name}"), table, f"{column} IN ({allowed})")


def _remap(mapping: dict[str, str]) -> None:
    for old, new in mapping.items():
        op.execute(
            sa.text("UPDATE dataqs_issues SET reason = :new WHERE reason = :old").bindparams(
                old=old, new=new
            )
        )


def upgrade() -> None:
    op.drop_constraint(op.f("ck_dataqs_issues_dataqs_reason"), "dataqs_issues", type_="check")
    op.alter_column(
        "dataqs_issues",
        "reason",
        existing_type=sa.String(length=20),
        type_=sa.String(length=30),
        existing_nullable=False,
    )
    _remap(REASON_MAP)
    allowed = ", ".join(f"'{v}'" for v in REASONS_AFTER)
    op.create_check_constraint(
        op.f("ck_dataqs_issues_dataqs_reason"), "dataqs_issues", f"reason IN ({allowed})"
    )
    _check("dataqs_correspondence", "dataqs_correspondence_kind", "kind", KINDS_AFTER)
    _check("dataqs_outbox", "dataqs_outbox_status", "status", OUTBOX_AFTER)

    op.add_column("dataqs_cases", sa.Column("viewed_in", sa.String(length=100), nullable=True))
    op.add_column("dataqs_evidence", sa.Column("title", sa.String(length=200), nullable=True))
    op.create_table(
        "dataqs_messages",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("author_id", sa.BigInteger(), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("recipients", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("outbox_event_id", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_dataqs_messages_author_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_messages_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_messages")),
    )
    op.create_index(
        op.f("ix_dataqs_messages_case_id"), "dataqs_messages", ["case_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_dataqs_messages_case_id"), table_name="dataqs_messages")
    op.drop_table("dataqs_messages")
    op.drop_column("dataqs_evidence", "title")
    op.drop_column("dataqs_cases", "viewed_in")
    op.execute("UPDATE dataqs_outbox SET status = 'FAILED' WHERE status = 'CANCELLED'")
    _check("dataqs_outbox", "dataqs_outbox_status", "status", OUTBOX_BEFORE)
    op.execute("UPDATE dataqs_correspondence SET kind = 'OTHER' WHERE kind = 'OPENED'")
    _check("dataqs_correspondence", "dataqs_correspondence_kind", "kind", KINDS_BEFORE)
    op.drop_constraint(op.f("ck_dataqs_issues_dataqs_reason"), "dataqs_issues", type_="check")
    _remap({new: old for old, new in REASON_MAP.items()})
    op.execute("UPDATE dataqs_issues SET reason = 'UNSURE' WHERE reason IN ('DRIVER_INCORRECT')")
    op.alter_column(
        "dataqs_issues",
        "reason",
        existing_type=sa.String(length=30),
        type_=sa.String(length=20),
        existing_nullable=False,
    )
    allowed = ", ".join(f"'{v}'" for v in REASONS_BEFORE)
    op.create_check_constraint(
        op.f("ck_dataqs_issues_dataqs_reason"), "dataqs_issues", f"reason IN ({allowed})"
    )
