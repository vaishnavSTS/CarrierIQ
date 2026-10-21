"""A DataQs case: a carrier's request, through STS, to correct one FMCSA safety event
(docs/DataQ.md).

One case per parent event (an inspection, later a crash), with one dataqs_issues row per thing the
carrier says is wrong (usually a violation). The event is preserved as it was when the case was
opened (`source_snapshot`): FMCSA data refreshes replace inspection and violation rows, so the case
never points at them by id. Inspection, citation and police report numbers stay in their own fields.

The tenant is the client organization (`organization_id`); dataqs_access.py decides who may read or
act on a case. `work_status` is STS's own progress; `government_raw_status` is exactly what DataQs
shows, kept apart. `row_version` is SQLAlchemy's version counter: a write based on an older read
fails instead of silently overwriting someone else's change.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import (
    DataQsActionOwner,
    DataQsEventType,
    DataQsOutcome,
    DataQsReason,
    DataQsReviewLevel,
    DataQsRoute,
    DataQsWorkStatus,
    enum_type,
)
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsCase(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_cases"
    __table_args__ = (
        # A government request id is unique within its program, not across programs.
        UniqueConstraint("route", "gov_request_id", name="uq_dataqs_cases_route_gov_request_id"),
        # Repeating a "create case" request with the same key returns the first case.
        UniqueConstraint(
            "organization_id", "idempotency_key", name="uq_dataqs_cases_org_idempotency_key"
        ),
    )

    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), index=True
    )
    usdot_number: Mapped[int] = mapped_column(BigInteger, index=True)
    route: Mapped[DataQsRoute] = mapped_column(
        enum_type(DataQsRoute, "dataqs_route"),
        default=DataQsRoute.DATAQS,
        server_default=DataQsRoute.DATAQS.value,
    )

    # The event, as preserved when the case was opened.
    event_type: Mapped[DataQsEventType] = mapped_column(
        enum_type(DataQsEventType, "dataqs_event_type")
    )
    source_event_id: Mapped[str] = mapped_column(String(50), index=True)  # FMCSA unique id
    inspection_report_number: Mapped[str | None] = mapped_column(String(50))
    citation_number: Mapped[str | None] = mapped_column(String(50))
    police_report_number: Mapped[str | None] = mapped_column(String(50))
    event_date: Mapped[date | None] = mapped_column(Date)  # None: unknown, a staff review item
    event_state: Mapped[str | None] = mapped_column(String(10))  # reporting jurisdiction
    source_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    source_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Intake step "check prior activity": existing DataQs id, prior representative, prior
    # decisions, pending court proceedings.
    prior_activity: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # Status: each dimension separate, None until known.
    work_status: Mapped[DataQsWorkStatus] = mapped_column(
        enum_type(DataQsWorkStatus, "dataqs_work_status", length=30),
        default=DataQsWorkStatus.DRAFT,
        server_default=DataQsWorkStatus.DRAFT.value,
        index=True,
    )
    government_raw_status: Mapped[str | None] = mapped_column(String(100))
    review_level: Mapped[DataQsReviewLevel | None] = mapped_column(
        enum_type(DataQsReviewLevel, "dataqs_review_level")
    )
    action_owner: Mapped[DataQsActionOwner | None] = mapped_column(
        enum_type(DataQsActionOwner, "dataqs_action_owner")
    )
    outcome: Mapped[DataQsOutcome | None] = mapped_column(
        enum_type(DataQsOutcome, "dataqs_outcome", length=30)
    )
    gov_request_id: Mapped[str | None] = mapped_column(String(50))

    owner_id: Mapped[int | None] = mapped_column(  # the STS case specialist
        BigInteger, ForeignKey("users.id"), index=True
    )
    created_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    row_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    __mapper_args__ = {"version_id_col": row_version}


class DataQsIssue(IdMixin, UpdatedAtMixin, Base):
    """One thing the carrier says is wrong on the event, decided on its own (a partial correction
    resolves some issues and leaves the rest open)."""

    __tablename__ = "dataqs_issues"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    violation_code: Mapped[str | None] = mapped_column(String(30))  # None: the whole event
    violation_unit: Mapped[str | None] = mapped_column(String(5))
    violation_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    reason: Mapped[DataQsReason] = mapped_column(enum_type(DataQsReason, "dataqs_reason"))
    recorded_value: Mapped[str | None] = mapped_column(Text)
    requested_value: Mapped[str | None] = mapped_column(Text)
    factual_basis: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[DataQsOutcome | None] = mapped_column(
        enum_type(DataQsOutcome, "dataqs_outcome", length=30)
    )
    outcome_reason: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
