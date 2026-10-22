"""How STS reaches each carrier about its DataQs requests (docs/DataQ.md).

A client company sees a contact for each carrier STS verified for it; only its account owner
(CLIENT_ADMIN) changes one. STS staff see the contact on that carrier's cases (case detail).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import DataQsMissingAuthorityError
from app.models import DataQsCarrierContact, DataQsCase, User
from app.models.enums import UserRole
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import (
    DataQsCarrierContactIn,
    DataQsCarrierContactListOut,
    DataQsCarrierContactOut,
)


class DataQsContactService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = DataQsCaseRepository(db)

    def _contact(self, organization_id: int, usdot_number: int) -> DataQsCarrierContact | None:
        return self.db.scalar(
            select(DataQsCarrierContact).where(
                DataQsCarrierContact.organization_id == organization_id,
                DataQsCarrierContact.usdot_number == usdot_number,
            )
        )

    def _out(
        self, usdot_number: int, contact: DataQsCarrierContact | None, names: dict[int, str]
    ) -> DataQsCarrierContactOut:
        carrier = self.repository.carrier(usdot_number)
        return DataQsCarrierContactOut(
            usdot_number=usdot_number,
            carrier_name=carrier.legal_name if carrier else None,
            email=contact.email if contact else None,
            phone=contact.phone if contact else None,
            updated_at=contact.updated_at if contact else None,
            updated_by_name=names.get(contact.updated_by_id) if contact else None,
        )

    def for_company(self, user: User) -> DataQsCarrierContactListOut:
        """Each carrier STS verified for the user's company, with its contact (if given)."""
        org = user.organization_id
        usdots = sorted(self.repository.verified_usdots(org))
        contacts = {
            c.usdot_number: c
            for c in self.db.scalars(
                select(DataQsCarrierContact).where(DataQsCarrierContact.organization_id == org)
            )
        }
        names = self.repository.user_names([c.updated_by_id for c in contacts.values()])
        return DataQsCarrierContactListOut(
            can_edit=user.role == UserRole.CLIENT_ADMIN,
            carriers=[self._out(u, contacts.get(u), names) for u in usdots],
        )

    def save(
        self, user: User, usdot_number: int, body: DataQsCarrierContactIn
    ) -> DataQsCarrierContactListOut:
        if user.role != UserRole.CLIENT_ADMIN:
            raise DataQsMissingAuthorityError(
                "Only your company's account owner can change its contact details"
            )
        if usdot_number not in self.repository.verified_usdots(user.organization_id):
            raise DataQsMissingAuthorityError("STS hasn't verified this carrier for your company")
        contact = self._contact(user.organization_id, usdot_number)
        if contact is None:
            contact = DataQsCarrierContact(
                organization_id=user.organization_id, usdot_number=usdot_number
            )
            self.db.add(contact)
        contact.email = body.email.strip()
        contact.phone = body.phone.strip()
        contact.updated_by_id = user.id
        self.db.commit()
        return self.for_company(user)

    def for_case(self, case: DataQsCase) -> DataQsCarrierContactOut | None:
        """The carrier's contact, for STS staff on one of its cases (None: not given yet)."""
        contact = self._contact(case.organization_id, case.usdot_number)
        if contact is None:
            return None
        return self._out(
            case.usdot_number, contact, self.repository.user_names([contact.updated_by_id])
        )
