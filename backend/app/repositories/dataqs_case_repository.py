"""Database access for DataQs cases and their audit trail (docs/DataQ.md).

This layer does not decide who may see what: services/dataqs_access.py does, and passes the
tenant filters in.
"""

from collections.abc import Collection
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Carrier,
    DataQsAuditEvent,
    DataQsAuthorization,
    DataQsCase,
    DataQsEvidence,
    DataQsEvidenceLink,
    DataQsIssue,
    Inspection,
    Organization,
    OrganizationCarrier,
    User,
)
from app.models.enums import DataQsWorkStatus, OrganizationKind


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

    # --- Intake ----------------------------------------------------------------------------------

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

    def by_idempotency_key(self, organization_id: int, key: str) -> DataQsCase | None:
        return self.db.scalar(
            select(DataQsCase).where(
                DataQsCase.organization_id == organization_id, DataQsCase.idempotency_key == key
            )
        )

    # --- A case's parts --------------------------------------------------------------------------

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

    def organization_names(self, organization_ids: Collection[int]) -> dict[int, str]:
        ids = list(set(organization_ids))
        if not ids:
            return {}
        rows = self.db.execute(
            select(Organization.id, Organization.name).where(Organization.id.in_(ids))
        )
        return {organization_id: name for organization_id, name in rows}
