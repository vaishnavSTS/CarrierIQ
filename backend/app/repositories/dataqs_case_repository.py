"""Database access for DataQs cases and their audit trail (docs/DataQ.md).

This layer does not decide who may see what: services/dataqs_access.py does, and passes the
tenant filters in.
"""

from collections.abc import Collection
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Carrier,
    DataQsAssessment,
    DataQsAuditEvent,
    DataQsAuthorization,
    DataQsCase,
    DataQsCorrespondence,
    DataQsEvidence,
    DataQsEvidenceLink,
    DataQsFilingProof,
    DataQsIssue,
    DataQsMessage,
    DataQsOutbox,
    DataQsPackage,
    DataQsReviewCycle,
    DataQsSubmissionAttempt,
    DataQsTask,
    Inspection,
    Organization,
    OrganizationCarrier,
    User,
)
from app.models.enums import (
    DataQsActionOwner,
    DataQsAttemptStatus,
    DataQsAuthorizationKind,
    DataQsRoute,
    DataQsWorkStatus,
    OrganizationKind,
    UserStatus,
)


class DataQsCaseRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, case_id: int) -> DataQsCase | None:
        return self.db.get(DataQsCase, case_id)

    def list_cases(
        self,
        *,
        organization_id: int | None = None,
        usdot_numbers: Collection[int] | None = None,
    ) -> list[DataQsCase]:
        """Newest first. None means no filter; an empty `usdot_numbers` matches nothing."""
        query = select(DataQsCase).order_by(DataQsCase.created_at.desc(), DataQsCase.id.desc())
        if organization_id is not None:
            query = query.where(DataQsCase.organization_id == organization_id)
        if usdot_numbers is not None:
            query = query.where(DataQsCase.usdot_number.in_(list(usdot_numbers)))
        return list(self.db.scalars(query))

    def verified_usdots(self, organization_id: int) -> set[int]:
        """The carriers a client organization may open DataQs cases for: linked and verified by
        STS, and only for a CLIENT organization."""
        rows = self.db.scalars(
            select(OrganizationCarrier.usdot_number)
            .join(Organization, Organization.id == OrganizationCarrier.organization_id)
            .where(
                OrganizationCarrier.organization_id == organization_id,
                OrganizationCarrier.verified.is_(True),
                Organization.kind == OrganizationKind.CLIENT,
            )
        )
        return set(rows)

    def audit(
        self,
        case: DataQsCase,
        actor: User | None,
        action: str,
        *,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
    ) -> DataQsAuditEvent:
        """Append an audit event in the caller's transaction, so the change and its record commit
        (or roll back) together."""
        if case.id is None:
            self.db.flush()
        event = DataQsAuditEvent(
            case_id=case.id,
            actor_id=actor.id if actor is not None else None,
            action=action,
            case_row_version=case.row_version,
            before=before,
            after=after,
        )
        self.db.add(event)
        self.db.flush()
        return event

    def audit_events(self, case_id: int) -> list[DataQsAuditEvent]:
        return list(
            self.db.scalars(
                select(DataQsAuditEvent)
                .where(DataQsAuditEvent.case_id == case_id)
                .order_by(DataQsAuditEvent.created_at, DataQsAuditEvent.id)
            )
        )

    # --- Intake -----------------------------------------------------------------------------------

    def carrier(self, usdot_number: int) -> Carrier | None:
        return self.db.scalar(select(Carrier).where(Carrier.usdot_number == usdot_number))

    def inspection(self, carrier_id: int, inspection_id: str) -> Inspection | None:
        return self.db.scalar(
            select(Inspection)
            .where(Inspection.carrier_id == carrier_id, Inspection.inspection_id == inspection_id)
            .order_by(Inspection.id)
            .limit(1)
        )

    def open_cases_for_event(self, usdot_number: int, source_event_id: str) -> list[DataQsCase]:
        """Every company's open cases on the event, for the duplicate check."""
        return list(
            self.db.scalars(
                select(DataQsCase).where(
                    DataQsCase.usdot_number == usdot_number,
                    DataQsCase.source_event_id == source_event_id,
                    DataQsCase.work_status != DataQsWorkStatus.CLOSED,
                )
            )
        )

    def cases_for_event(self, usdot_number: int, source_event_id: str) -> list[DataQsCase]:
        """Every company's cases on the event, closed ones too, oldest first."""
        return list(
            self.db.scalars(
                select(DataQsCase)
                .where(
                    DataQsCase.usdot_number == usdot_number,
                    DataQsCase.source_event_id == source_event_id,
                )
                .order_by(DataQsCase.id)
            )
        )

    def by_idempotency_key(self, organization_id: int, key: str) -> DataQsCase | None:
        return self.db.scalar(
            select(DataQsCase).where(
                DataQsCase.organization_id == organization_id, DataQsCase.idempotency_key == key
            )
        )

    # --- A case's parts ---------------------------------------------------------------------------

    def issues(self, case_ids: Collection[int]) -> list[DataQsIssue]:
        if not case_ids:
            return []
        return list(
            self.db.scalars(
                select(DataQsIssue)
                .where(DataQsIssue.case_id.in_(list(case_ids)))
                .order_by(DataQsIssue.id)
            )
        )

    def evidence(self, case_ids: Collection[int]) -> list[DataQsEvidence]:
        if not case_ids:
            return []
        return list(
            self.db.scalars(
                select(DataQsEvidence)
                .where(DataQsEvidence.case_id.in_(list(case_ids)))
                .order_by(DataQsEvidence.id)
            )
        )

    def evidence_links(self, evidence_ids: Collection[int]) -> list[DataQsEvidenceLink]:
        if not evidence_ids:
            return []
        return list(
            self.db.scalars(
                select(DataQsEvidenceLink)
                .where(DataQsEvidenceLink.evidence_id.in_(list(evidence_ids)))
                .order_by(DataQsEvidenceLink.id)
            )
        )

    def authorizations(self, case_id: int) -> list[DataQsAuthorization]:
        return list(
            self.db.scalars(
                select(DataQsAuthorization)
                .where(DataQsAuthorization.case_id == case_id)
                .order_by(DataQsAuthorization.id)
            )
        )

    def user_names(self, user_ids: Collection[int]) -> dict[int, str]:
        ids = [i for i in set(user_ids) if i is not None]
        if not ids:
            return {}
        rows = self.db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))
        return {user_id: name for user_id, name in rows}

    def client_organizations_for_carrier(self, usdot_number: int) -> list[tuple[int, str]]:
        """Client companies STS verified this carrier for, as (id, name), oldest link first."""
        rows = self.db.execute(
            select(Organization.id, Organization.name)
            .join(OrganizationCarrier, OrganizationCarrier.organization_id == Organization.id)
            .where(
                OrganizationCarrier.usdot_number == usdot_number,
                OrganizationCarrier.verified.is_(True),
                Organization.kind == OrganizationKind.CLIENT,
            )
            .order_by(OrganizationCarrier.id)
        )
        return [(organization_id, name) for organization_id, name in rows]

    def sts_organization_ids(self, organization_ids: Collection[int]) -> set[int]:
        """Which of these organizations are STS itself (cases STS holds for a carrier)."""
        ids = list(set(organization_ids))
        if not ids:
            return set()
        return set(
            self.db.scalars(
                select(Organization.id).where(
                    Organization.id.in_(ids), Organization.kind == OrganizationKind.STS
                )
            )
        )

    def held_drafts(self, usdot_number: int) -> list[DataQsCase]:
        """Draft cases STS staff opened for a carrier with no client company yet."""
        return list(
            self.db.scalars(
                select(DataQsCase)
                .join(Organization, Organization.id == DataQsCase.organization_id)
                .where(
                    DataQsCase.usdot_number == usdot_number,
                    DataQsCase.work_status == DataQsWorkStatus.DRAFT,
                    Organization.kind == OrganizationKind.STS,
                )
                .order_by(DataQsCase.id)
            )
        )

    def organization_names(self, organization_ids: Collection[int]) -> dict[int, str]:
        ids = list(set(organization_ids))
        if not ids:
            return {}
        rows = self.db.execute(
            select(Organization.id, Organization.name).where(Organization.id.in_(ids))
        )
        return {organization_id: name for organization_id, name in rows}

    # --- Tasks ------------------------------------------------------------------------------------

    def open_tasks(self, case_ids: Collection[int]) -> list[DataQsTask]:
        if not case_ids:
            return []
        return list(
            self.db.scalars(
                select(DataQsTask)
                .where(DataQsTask.case_id.in_(list(case_ids)), DataQsTask.completed_at.is_(None))
                .order_by(DataQsTask.id)
            )
        )

    def add_task(
        self,
        case: DataQsCase,
        kind: str,
        title: str,
        owner: DataQsActionOwner,
        *,
        detail: str | None = None,
        assignee_id: int | None = None,
    ) -> DataQsTask:
        task = DataQsTask(
            case_id=case.id,
            kind=kind,
            title=title,
            detail=detail,
            action_owner=owner,
            assignee_id=assignee_id,
        )
        self.db.add(task)
        return task

    def complete_tasks(
        self, case: DataQsCase, kinds: Collection[str], by: User | None, at: datetime
    ) -> None:
        """`by` None: done by the app (e.g. the FMCSA correction check)."""
        for task in self.open_tasks([case.id]):
            if task.kind in kinds:
                task.completed_at, task.completed_by_id = at, by.id if by else None

    # --- Assessment, packages, approval -----------------------------------------------------------

    def assessments(self, case_id: int) -> list[DataQsAssessment]:
        return list(
            self.db.scalars(
                select(DataQsAssessment)
                .where(DataQsAssessment.case_id == case_id)
                .order_by(DataQsAssessment.id)
            )
        )

    def packages(self, case_id: int) -> list[DataQsPackage]:
        """Every version, oldest first."""
        return list(
            self.db.scalars(
                select(DataQsPackage)
                .where(DataQsPackage.case_id == case_id)
                .order_by(DataQsPackage.package_version)
            )
        )

    def current_package(self, case_id: int) -> DataQsPackage | None:
        """The newest package that a later edit has not replaced."""
        return self.db.scalar(
            select(DataQsPackage)
            .where(DataQsPackage.case_id == case_id, DataQsPackage.invalidated_at.is_(None))
            .order_by(DataQsPackage.package_version.desc())
            .limit(1)
        )

    def current_approval(self, case_id: int) -> DataQsAuthorization | None:
        """The carrier's approval of the current package, if it still stands: same package, same
        hash, not revoked. A package edit makes a new package, so an old approval never matches."""
        package = self.current_package(case_id)
        if package is None:
            return None
        return self.db.scalar(
            select(DataQsAuthorization)
            .where(
                DataQsAuthorization.case_id == case_id,
                DataQsAuthorization.kind == DataQsAuthorizationKind.PACKAGE_APPROVAL,
                DataQsAuthorization.package_id == package.id,
                DataQsAuthorization.package_hash == package.manifest_hash,
                DataQsAuthorization.revoked_at.is_(None),
            )
            .order_by(DataQsAuthorization.id.desc())
            .limit(1)
        )

    def staff_users(self) -> list[User]:
        """Active STS staff, for assigning a case owner."""
        return list(
            self.db.scalars(
                select(User)
                .join(Organization, Organization.id == User.organization_id)
                .where(Organization.kind == OrganizationKind.STS, User.status == UserStatus.ACTIVE)
                .order_by(User.full_name)
            )
        )

    # --- Filing (Phase 4) -------------------------------------------------------------------------

    def attempts(self, case_id: int) -> list[DataQsSubmissionAttempt]:
        return list(
            self.db.scalars(
                select(DataQsSubmissionAttempt)
                .where(DataQsSubmissionAttempt.case_id == case_id)
                .order_by(DataQsSubmissionAttempt.id)
            )
        )

    def filing_proofs(self, case_id: int) -> list[DataQsFilingProof]:
        return list(
            self.db.scalars(
                select(DataQsFilingProof)
                .where(DataQsFilingProof.case_id == case_id)
                .order_by(DataQsFilingProof.id)
            )
        )

    def open_attempt(self, case_id: int) -> DataQsSubmissionAttempt | None:
        """An attempt still STARTED or UNCONFIRMED: it must be settled before another one."""
        return self.db.scalar(
            select(DataQsSubmissionAttempt).where(
                DataQsSubmissionAttempt.case_id == case_id,
                DataQsSubmissionAttempt.status.in_(
                    [DataQsAttemptStatus.STARTED, DataQsAttemptStatus.UNCONFIRMED]
                ),
            )
        )

    def attempt_by_key(self, case_id: int, key: str) -> DataQsSubmissionAttempt | None:
        return self.db.scalar(
            select(DataQsSubmissionAttempt).where(
                DataQsSubmissionAttempt.case_id == case_id,
                DataQsSubmissionAttempt.idempotency_key == key,
            )
        )

    def case_by_gov_request_id(self, route: DataQsRoute, gov_request_id: str) -> DataQsCase | None:
        return self.db.scalar(
            select(DataQsCase).where(
                DataQsCase.route == route, DataQsCase.gov_request_id == gov_request_id
            )
        )

    def review_cycles(self, case_id: int) -> list[DataQsReviewCycle]:
        return list(
            self.db.scalars(
                select(DataQsReviewCycle)
                .where(DataQsReviewCycle.case_id == case_id)
                .order_by(DataQsReviewCycle.id)
            )
        )

    def correspondence(self, case_id: int) -> list[DataQsCorrespondence]:
        return list(
            self.db.scalars(
                select(DataQsCorrespondence)
                .where(DataQsCorrespondence.case_id == case_id)
                .order_by(DataQsCorrespondence.id)
            )
        )

    def messages(self, case_id: int) -> list[DataQsMessage]:
        return list(
            self.db.scalars(
                select(DataQsMessage)
                .where(DataQsMessage.case_id == case_id)
                .order_by(DataQsMessage.id)
            )
        )

    def outbox(self, case_id: int) -> list[DataQsOutbox]:
        return list(
            self.db.scalars(
                select(DataQsOutbox)
                .where(DataQsOutbox.case_id == case_id)
                .order_by(DataQsOutbox.id)
            )
        )
