"""Database access for users, organizations and the carriers a client organization operates."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Carrier, Organization, OrganizationCarrier, Phone, User
from app.models.enums import OrganizationKind, UserStatus


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email.strip().lower()))

    def by_google_sub(self, google_sub: str) -> User | None:
        return self.db.scalar(select(User).where(User.google_sub == google_sub))

    def organization(self, organization_id: int) -> Organization | None:
        return self.db.get(Organization, organization_id)

    def sts_organization(self) -> Organization | None:
        return self.db.scalar(
            select(Organization)
            .where(Organization.kind == OrganizationKind.STS)
            .order_by(Organization.id)
            .limit(1)
        )

    def list_users(self, status: UserStatus | None = None) -> list[User]:
        query = select(User).order_by(User.created_at.desc(), User.id.desc())
        if status is not None:
            query = query.where(User.status == status)
        return list(self.db.scalars(query))

    def organization_carriers(
        self, organization_id: int, *, verified_only: bool = False
    ) -> list[OrganizationCarrier]:
        query = select(OrganizationCarrier).where(
            OrganizationCarrier.organization_id == organization_id
        )
        if verified_only:
            query = query.where(OrganizationCarrier.verified.is_(True))
        return list(self.db.scalars(query.order_by(OrganizationCarrier.usdot_number)))

    def current_phones(self, carrier_id: int) -> set[str]:
        """The carrier's FMCSA phone and fax numbers, 10 digits each."""
        rows = self.db.scalars(
            select(Phone.number_normalized).where(
                Phone.carrier_id == carrier_id, Phone.is_current.is_(True)
            )
        )
        return set(rows)

    def carriers_by_usdot(self, usdot_numbers: list[int]) -> dict[int, Carrier]:
        if not usdot_numbers:
            return {}
        rows = self.db.scalars(select(Carrier).where(Carrier.usdot_number.in_(usdot_numbers)))
        return {carrier.usdot_number: carrier for carrier in rows}
