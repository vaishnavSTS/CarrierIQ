"""Database access for DataQs cases and their audit trail (docs/DataQ.md).

This layer does not decide who may see what: services/dataqs_access.py does, and passes the
tenant filters in.
"""

from collections.abc import Collection
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsAuditEvent, DataQsCase, Organization, OrganizationCarrier, User
from app.models.enums import OrganizationKind


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
