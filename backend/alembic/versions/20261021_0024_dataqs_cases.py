"""dataqs cases: DataQs case tables (docs/DataQ.md, Phase 1)

Cases and their issues, evidence and its issue links, packages, authorizations, filing attempts,
review cycles, agency correspondence, deadline clocks and pauses, tasks, the append-only audit
trail and the notification outbox. All new tables; no existing table changes.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-21 10:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dataqs_cases",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("organization_id", sa.BigInteger(), nullable=False),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False),
        sa.Column(
            "route",
            sa.Enum(
                "DATAQS",
                "CPDP",
                name="dataqs_route",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="DATAQS",
            nullable=False,
        ),
        sa.Column(
            "event_type",
            sa.Enum(
                "INSPECTION",
                "CRASH",
                name="dataqs_event_type",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("source_event_id", sa.String(length=50), nullable=False),
        sa.Column("inspection_report_number", sa.String(length=50), nullable=True),
        sa.Column("citation_number", sa.String(length=50), nullable=True),
        sa.Column("police_report_number", sa.String(length=50), nullable=True),
        sa.Column("event_date", sa.Date(), nullable=True),
        sa.Column("event_state", sa.String(length=10), nullable=True),
        sa.Column("source_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source_observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("prior_activity", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "work_status",
            sa.Enum(
                "DRAFT",
                "EVIDENCE_NEEDED",
                "STAFF_REVIEW",
                "AWAITING_APPROVAL",
                "READY_TO_FILE",
                "SUBMISSION_UNCONFIRMED",
                "MONITORING",
                "VERIFICATION",
                "CLOSED",
                name="dataqs_work_status",
                native_enum=False,
                create_constraint=True,
                length=30,
            ),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column("government_raw_status", sa.String(length=100), nullable=True),
        sa.Column(
            "review_level",
            sa.Enum(
                "INITIAL",
                "RECONSIDERATION",
                "FINAL",
                name="dataqs_review_level",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=True,
        ),
        sa.Column(
            "action_owner",
            sa.Enum(
                "CARRIER",
                "STS",
                "AGENCY",
                name="dataqs_action_owner",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=True,
        ),
        sa.Column(
            "outcome",
            sa.Enum(
                "FULL_CORRECTION",
                "PARTIAL_CORRECTION",
                "NO_CORRECTION",
                "PROCEDURAL_CLOSURE",
                "WITHDRAWN",
                name="dataqs_outcome",
                native_enum=False,
                create_constraint=True,
                length=30,
            ),
            nullable=True,
        ),
        sa.Column("gov_request_id", sa.String(length=50), nullable=True),
        sa.Column("owner_id", sa.BigInteger(), nullable=True),
        sa.Column("created_by_id", sa.BigInteger(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=100), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("row_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], name=op.f("fk_dataqs_cases_created_by_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_dataqs_cases_organization_id_organizations"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_dataqs_cases_owner_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_cases")),
        sa.UniqueConstraint(
            "organization_id", "idempotency_key", name="uq_dataqs_cases_org_idempotency_key"
        ),
        sa.UniqueConstraint("route", "gov_request_id", name="uq_dataqs_cases_route_gov_request_id"),
    )
    op.create_index(
        op.f("ix_dataqs_cases_organization_id"), "dataqs_cases", ["organization_id"], unique=False
    )
    op.create_index(op.f("ix_dataqs_cases_owner_id"), "dataqs_cases", ["owner_id"], unique=False)
    op.create_index(
        op.f("ix_dataqs_cases_source_event_id"), "dataqs_cases", ["source_event_id"], unique=False
    )
    op.create_index(
        op.f("ix_dataqs_cases_usdot_number"), "dataqs_cases", ["usdot_number"], unique=False
    )
    op.create_index(
        op.f("ix_dataqs_cases_work_status"), "dataqs_cases", ["work_status"], unique=False
    )
    op.create_table(
        "dataqs_audit_events",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=True),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column("case_row_version", sa.Integer(), nullable=True),
        sa.Column("before", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name=op.f("fk_dataqs_audit_events_actor_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_audit_events_case_id_dataqs_cases"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_audit_events")),
    )
    op.create_index(
        op.f("ix_dataqs_audit_events_case_id"), "dataqs_audit_events", ["case_id"], unique=False
    )
    op.create_table(
        "dataqs_evidence",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("object_key", sa.String(length=500), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("original_id", sa.BigInteger(), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("document_date", sa.Date(), nullable=True),
        sa.Column(
            "scan_status",
            sa.Enum(
                "PENDING",
                "CLEAN",
                "INFECTED",
                "FAILED",
                name="dataqs_scan_status",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("uploaded_by_id", sa.BigInteger(), nullable=False),
        sa.Column("source_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_evidence_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["original_id"],
            ["dataqs_evidence.id"],
            name=op.f("fk_dataqs_evidence_original_id_dataqs_evidence"),
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_id"], ["users.id"], name=op.f("fk_dataqs_evidence_uploaded_by_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_evidence")),
        sa.UniqueConstraint("object_key", name=op.f("uq_dataqs_evidence_object_key")),
    )
    op.create_index(
        op.f("ix_dataqs_evidence_case_id"), "dataqs_evidence", ["case_id"], unique=False
    )
    op.create_table(
        "dataqs_issues",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("violation_code", sa.String(length=30), nullable=True),
        sa.Column("violation_unit", sa.String(length=5), nullable=True),
        sa.Column("violation_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "reason",
            sa.Enum(
                "WRONG_ATTRIBUTION",
                "INACCURATE_VIOLATION",
                "DUPLICATE",
                "FIELD_CORRECTION",
                "COURT_OUTCOME",
                "UNSURE",
                name="dataqs_reason",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.Column("recorded_value", sa.Text(), nullable=True),
        sa.Column("requested_value", sa.Text(), nullable=True),
        sa.Column("factual_basis", sa.Text(), nullable=True),
        sa.Column(
            "outcome",
            sa.Enum(
                "FULL_CORRECTION",
                "PARTIAL_CORRECTION",
                "NO_CORRECTION",
                "PROCEDURAL_CLOSURE",
                "WITHDRAWN",
                name="dataqs_outcome",
                native_enum=False,
                create_constraint=True,
                length=30,
            ),
            nullable=True,
        ),
        sa.Column("outcome_reason", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_issues_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_issues")),
    )
    op.create_index(op.f("ix_dataqs_issues_case_id"), "dataqs_issues", ["case_id"], unique=False)
    op.create_table(
        "dataqs_outbox",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("event_id", sa.String(length=100), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("recipient_id", sa.BigInteger(), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "SENT",
                "FAILED",
                name="dataqs_outbox_status",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"], ["dataqs_cases.id"], name=op.f("fk_dataqs_outbox_case_id_dataqs_cases")
        ),
        sa.ForeignKeyConstraint(
            ["recipient_id"], ["users.id"], name=op.f("fk_dataqs_outbox_recipient_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_outbox")),
        sa.UniqueConstraint("event_id", name=op.f("uq_dataqs_outbox_event_id")),
    )
    op.create_index(op.f("ix_dataqs_outbox_case_id"), "dataqs_outbox", ["case_id"], unique=False)
    op.create_index(op.f("ix_dataqs_outbox_status"), "dataqs_outbox", ["status"], unique=False)
    op.create_table(
        "dataqs_packages",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("package_version", sa.Integer(), nullable=False),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("manifest_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by_id", sa.BigInteger(), nullable=False),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_packages_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], name=op.f("fk_dataqs_packages_created_by_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_packages")),
        sa.UniqueConstraint("case_id", "package_version", name="uq_dataqs_packages_case_version"),
    )
    op.create_index(
        op.f("ix_dataqs_packages_case_id"), "dataqs_packages", ["case_id"], unique=False
    )
    op.create_table(
        "dataqs_review_cycles",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "level",
            sa.Enum(
                "INITIAL",
                "RECONSIDERATION",
                "FINAL",
                name="dataqs_review_level",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("cycle_number", sa.Integer(), nullable=False),
        sa.Column("parent_cycle_id", sa.BigInteger(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "outcome",
            sa.Enum(
                "FULL_CORRECTION",
                "PARTIAL_CORRECTION",
                "NO_CORRECTION",
                "PROCEDURAL_CLOSURE",
                "WITHDRAWN",
                name="dataqs_outcome",
                native_enum=False,
                create_constraint=True,
                length=30,
            ),
            nullable=True,
        ),
        sa.Column("decided_by", sa.String(length=200), nullable=True),
        sa.Column("decision", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_review_cycles_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_cycle_id"],
            ["dataqs_review_cycles.id"],
            name=op.f("fk_dataqs_review_cycles_parent_cycle_id_dataqs_review_cycles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_review_cycles")),
        sa.UniqueConstraint(
            "case_id", "level", "cycle_number", name="uq_dataqs_review_cycles_case_level_number"
        ),
    )
    op.create_index(
        op.f("ix_dataqs_review_cycles_case_id"), "dataqs_review_cycles", ["case_id"], unique=False
    )
    op.create_table(
        "dataqs_authorizations",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "SERVICE_CONSENT",
                "PACKAGE_APPROVAL",
                name="dataqs_authorization_kind",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("signer_id", sa.BigInteger(), nullable=False),
        sa.Column("signer_name", sa.String(length=200), nullable=False),
        sa.Column("signer_title", sa.String(length=100), nullable=True),
        sa.Column("authority_check", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("terms_version", sa.String(length=20), nullable=False),
        sa.Column("package_id", sa.BigInteger(), nullable=True),
        sa.Column("package_hash", sa.String(length=64), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_authorizations_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["dataqs_packages.id"],
            name=op.f("fk_dataqs_authorizations_package_id_dataqs_packages"),
        ),
        sa.ForeignKeyConstraint(
            ["signer_id"], ["users.id"], name=op.f("fk_dataqs_authorizations_signer_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_authorizations")),
    )
    op.create_index(
        op.f("ix_dataqs_authorizations_case_id"), "dataqs_authorizations", ["case_id"], unique=False
    )
    op.create_table(
        "dataqs_clocks",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "clock_type",
            sa.Enum(
                "FILING_WINDOW",
                "AGENCY_REVIEW",
                "REQUESTER_INFO",
                "APPEAL",
                "INTERNAL",
                name="dataqs_clock_type",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("base_event", sa.String(length=50), nullable=False),
        sa.Column("base_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(length=50), nullable=True),
        sa.Column("policy_version", sa.String(length=20), nullable=False),
        sa.Column("authority_source", sa.String(length=200), nullable=True),
        sa.Column("budget_days", sa.Integer(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "confidence",
            sa.Enum(
                "HIGH",
                "MEDIUM",
                "LOW",
                name="confidence",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("override_reason", sa.Text(), nullable=True),
        sa.Column("overridden_by_id", sa.BigInteger(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_clocks_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["cycle_id"],
            ["dataqs_review_cycles.id"],
            name=op.f("fk_dataqs_clocks_cycle_id_dataqs_review_cycles"),
        ),
        sa.ForeignKeyConstraint(
            ["overridden_by_id"], ["users.id"], name=op.f("fk_dataqs_clocks_overridden_by_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_clocks")),
    )
    op.create_index(op.f("ix_dataqs_clocks_case_id"), "dataqs_clocks", ["case_id"], unique=False)
    op.create_table(
        "dataqs_correspondence",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("cycle_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "source",
            sa.Enum(
                "DATAQS_PORTAL",
                "EMAIL",
                "PHONE",
                "OTHER",
                name="dataqs_correspondence_source",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.Enum(
                "ACKNOWLEDGEMENT",
                "INFO_REQUEST",
                "INFO_RESPONSE",
                "DECISION",
                "REOPENING",
                "OTHER",
                name="dataqs_correspondence_kind",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("inbound", sa.Boolean(), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=True),
        sa.Column("original_payload", sa.Text(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recorded_by_id", sa.BigInteger(), nullable=False),
        sa.Column("verified_by_id", sa.BigInteger(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_correspondence_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["cycle_id"],
            ["dataqs_review_cycles.id"],
            name=op.f("fk_dataqs_correspondence_cycle_id_dataqs_review_cycles"),
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by_id"],
            ["users.id"],
            name=op.f("fk_dataqs_correspondence_recorded_by_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_id"],
            ["users.id"],
            name=op.f("fk_dataqs_correspondence_verified_by_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_correspondence")),
    )
    op.create_index(
        op.f("ix_dataqs_correspondence_case_id"), "dataqs_correspondence", ["case_id"], unique=False
    )
    op.create_table(
        "dataqs_evidence_links",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("evidence_id", sa.BigInteger(), nullable=False),
        sa.Column("issue_id", sa.BigInteger(), nullable=False),
        sa.Column("relevance", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["evidence_id"],
            ["dataqs_evidence.id"],
            name=op.f("fk_dataqs_evidence_links_evidence_id_dataqs_evidence"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["issue_id"],
            ["dataqs_issues.id"],
            name=op.f("fk_dataqs_evidence_links_issue_id_dataqs_issues"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_evidence_links")),
        sa.UniqueConstraint(
            "evidence_id", "issue_id", name="uq_dataqs_evidence_links_evidence_issue"
        ),
    )
    op.create_index(
        op.f("ix_dataqs_evidence_links_evidence_id"),
        "dataqs_evidence_links",
        ["evidence_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_dataqs_evidence_links_issue_id"),
        "dataqs_evidence_links",
        ["issue_id"],
        unique=False,
    )
    op.create_table(
        "dataqs_submission_attempts",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("package_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "STARTED",
                "UNCONFIRMED",
                "CONFIRMED",
                "ABANDONED",
                name="dataqs_attempt_status",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="STARTED",
            nullable=False,
        ),
        sa.Column("filed_by_id", sa.BigInteger(), nullable=False),
        sa.Column("filing_account", sa.String(length=200), nullable=True),
        sa.Column("idempotency_key", sa.String(length=100), nullable=True),
        sa.Column("filed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gov_request_id", sa.String(length=50), nullable=True),
        sa.Column("assigned_agency", sa.String(length=200), nullable=True),
        sa.Column("receipt", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_submission_attempts_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["filed_by_id"],
            ["users.id"],
            name=op.f("fk_dataqs_submission_attempts_filed_by_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["dataqs_packages.id"],
            name=op.f("fk_dataqs_submission_attempts_package_id_dataqs_packages"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_submission_attempts")),
        sa.UniqueConstraint(
            "case_id", "idempotency_key", name="uq_dataqs_submission_attempts_case_key"
        ),
    )
    op.create_index(
        op.f("ix_dataqs_submission_attempts_case_id"),
        "dataqs_submission_attempts",
        ["case_id"],
        unique=False,
    )
    op.create_table(
        "dataqs_clock_pauses",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("clock_id", sa.BigInteger(), nullable=False),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_correspondence_id", sa.BigInteger(), nullable=True),
        sa.Column("end_correspondence_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["clock_id"],
            ["dataqs_clocks.id"],
            name=op.f("fk_dataqs_clock_pauses_clock_id_dataqs_clocks"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["end_correspondence_id"],
            ["dataqs_correspondence.id"],
            name=op.f("fk_dataqs_clock_pauses_end_correspondence_id_dataqs_correspondence"),
        ),
        sa.ForeignKeyConstraint(
            ["start_correspondence_id"],
            ["dataqs_correspondence.id"],
            name=op.f("fk_dataqs_clock_pauses_start_correspondence_id_dataqs_correspondence"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_clock_pauses")),
    )
    op.create_index(
        op.f("ix_dataqs_clock_pauses_clock_id"), "dataqs_clock_pauses", ["clock_id"], unique=False
    )
    op.create_table(
        "dataqs_tasks",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("case_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column(
            "action_owner",
            sa.Enum(
                "CARRIER",
                "STS",
                "AGENCY",
                name="dataqs_action_owner",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("assignee_id", sa.BigInteger(), nullable=True),
        sa.Column("clock_id", sa.BigInteger(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by_id", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["assignee_id"], ["users.id"], name=op.f("fk_dataqs_tasks_assignee_id_users")
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["dataqs_cases.id"],
            name=op.f("fk_dataqs_tasks_case_id_dataqs_cases"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["clock_id"], ["dataqs_clocks.id"], name=op.f("fk_dataqs_tasks_clock_id_dataqs_clocks")
        ),
        sa.ForeignKeyConstraint(
            ["completed_by_id"], ["users.id"], name=op.f("fk_dataqs_tasks_completed_by_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_tasks")),
    )
    op.create_index(
        op.f("ix_dataqs_tasks_assignee_id"), "dataqs_tasks", ["assignee_id"], unique=False
    )
    op.create_index(op.f("ix_dataqs_tasks_case_id"), "dataqs_tasks", ["case_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_dataqs_tasks_case_id"), table_name="dataqs_tasks")
    op.drop_index(op.f("ix_dataqs_tasks_assignee_id"), table_name="dataqs_tasks")
    op.drop_table("dataqs_tasks")
    op.drop_index(op.f("ix_dataqs_clock_pauses_clock_id"), table_name="dataqs_clock_pauses")
    op.drop_table("dataqs_clock_pauses")
    op.drop_index(
        op.f("ix_dataqs_submission_attempts_case_id"), table_name="dataqs_submission_attempts"
    )
    op.drop_table("dataqs_submission_attempts")
    op.drop_index(op.f("ix_dataqs_evidence_links_issue_id"), table_name="dataqs_evidence_links")
    op.drop_index(op.f("ix_dataqs_evidence_links_evidence_id"), table_name="dataqs_evidence_links")
    op.drop_table("dataqs_evidence_links")
    op.drop_index(op.f("ix_dataqs_correspondence_case_id"), table_name="dataqs_correspondence")
    op.drop_table("dataqs_correspondence")
    op.drop_index(op.f("ix_dataqs_clocks_case_id"), table_name="dataqs_clocks")
    op.drop_table("dataqs_clocks")
    op.drop_index(op.f("ix_dataqs_authorizations_case_id"), table_name="dataqs_authorizations")
    op.drop_table("dataqs_authorizations")
    op.drop_index(op.f("ix_dataqs_review_cycles_case_id"), table_name="dataqs_review_cycles")
    op.drop_table("dataqs_review_cycles")
    op.drop_index(op.f("ix_dataqs_packages_case_id"), table_name="dataqs_packages")
    op.drop_table("dataqs_packages")
    op.drop_index(op.f("ix_dataqs_outbox_status"), table_name="dataqs_outbox")
    op.drop_index(op.f("ix_dataqs_outbox_case_id"), table_name="dataqs_outbox")
    op.drop_table("dataqs_outbox")
    op.drop_index(op.f("ix_dataqs_issues_case_id"), table_name="dataqs_issues")
    op.drop_table("dataqs_issues")
    op.drop_index(op.f("ix_dataqs_evidence_case_id"), table_name="dataqs_evidence")
    op.drop_table("dataqs_evidence")
    op.drop_index(op.f("ix_dataqs_audit_events_case_id"), table_name="dataqs_audit_events")
    op.drop_table("dataqs_audit_events")
    op.drop_index(op.f("ix_dataqs_cases_work_status"), table_name="dataqs_cases")
    op.drop_index(op.f("ix_dataqs_cases_usdot_number"), table_name="dataqs_cases")
    op.drop_index(op.f("ix_dataqs_cases_source_event_id"), table_name="dataqs_cases")
    op.drop_index(op.f("ix_dataqs_cases_owner_id"), table_name="dataqs_cases")
    op.drop_index(op.f("ix_dataqs_cases_organization_id"), table_name="dataqs_cases")
    op.drop_table("dataqs_cases")
