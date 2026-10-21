"""Who may see and act on DataQs cases (docs/DataQ.md, Phase 1). Every DataQs route and background
job goes through here, including evidence downloads.

- STS staff (admins and analysts): every case.
- Client users: only their own organization's cases, and only for carriers STS has verified as
  theirs. CLIENT_ADMIN can act (open cases, upload, authorize, approve); CLIENT_USER can only view.
  Client search (CLIENT_SEARCH_ENABLED) never widens this.
- Brokers: no DataQs access.

A case the user may not see answers "not found", the same as a case that does not exist, so the
portal never confirms another company's case.
"""

from collections.abc import Collection

from sqlalchemy.orm import Session

from app.core.exceptions import DataQsCaseNotFoundError, DataQsMissingAuthorityError
from app.models import DataQsCase, User
from app.models.enums import UserRole
from app.repositories.dataqs_case_repository import DataQsCaseRepository


def may_view(user: User, case: DataQsCase, verified_usdots: Collection[int]) -> bool:
    if user.role.is_staff:
        return True
    return (
        user.role.is_client
        and case.organization_id == user.organization_id
        and case.usdot_number in verified_usdots
    )


def may_act(user: User, case: DataQsCase, verified_usdots: Collection[int]) -> bool:
    if not may_view(user, case, verified_usdots):
        return False
    return user.role.is_staff or user.role == UserRole.CLIENT_ADMIN


class DataQsAccess:
    def __init__(self, db: Session, repository: DataQsCaseRepository | None = None) -> None:
        self.repository = repository or DataQsCaseRepository(db)

    def _verified(self, user: User) -> set[int]:
        if user.role.is_staff:
            return set()  # staff see every case; no carrier filter
        return self.repository.verified_usdots(user.organization_id)

    def visible_cases(self, user: User) -> list[DataQsCase]:
        if user.role.is_staff:
            return self.repository.list_cases()
        if not user.role.is_client:
            return []
        return self.repository.list_cases(
            organization_id=user.organization_id, usdot_numbers=self._verified(user)
        )

    def case_to_view(self, user: User, case_id: int) -> DataQsCase:
        case = self.repository.get(case_id)
        if case is None or not may_view(user, case, self._verified(user)):
            raise DataQsCaseNotFoundError(f"DataQs case {case_id} not found")
        return case

    def case_to_act_on(self, user: User, case_id: int) -> DataQsCase:
        case = self.case_to_view(user, case_id)
        if not may_act(user, case, self._verified(user)):
            raise DataQsMissingAuthorityError(
                "Only your company's account owner can make changes to a DataQs case"
            )
        return case

    def ensure_can_open_case(self, user: User, organization_id: int, usdot_number: int) -> None:
        """A new case: for a carrier STS has verified as the client organization's, opened by that
        organization's CLIENT_ADMIN or by STS staff on its behalf."""
        if user.role.is_client:
            if user.role != UserRole.CLIENT_ADMIN or organization_id != user.organization_id:
                raise DataQsMissingAuthorityError(
                    "Only your company's account owner can open a DataQs case"
                )
        elif not user.role.is_staff:
            raise DataQsMissingAuthorityError("DataQs is for STS clients and staff")
        if usdot_number not in self.repository.verified_usdots(organization_id):
            raise DataQsMissingAuthorityError(
                f"USDOT {usdot_number} is not a verified carrier of this company; "
                "STS must verify it before a DataQs case can be opened"
            )
