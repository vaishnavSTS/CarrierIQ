"""Registration, login, account approval and the client portal overview.

Rules:
- A client who registers gets a new CLIENT organization and a PENDING CLIENT_ADMIN account. The
  USDOT number they name is saved unverified; nothing is shown to them until an STS admin
  approves the account, which also verifies that USDOT number.
- PENDING and DISABLED accounts cannot log in.
- STS staff never self-register: they are created with `python -m app.cli.create_staff_user`.
"""

from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import (
    AccountDisabledError,
    AccountPendingError,
    ConflictError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.core.security import hash_password, verify_password
from app.models import Organization, OrganizationCarrier, User
from app.models.enums import OrganizationKind, UserRole, UserStatus
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AdminUserOut,
    CarrierContactCheckOut,
    LoginIn,
    PortalCarrierOut,
    PortalOverviewOut,
    RegisterIn,
    RegisterOut,
    UserOut,
)

# Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
_DUMMY_HASH = hash_password("not-a-real-password")


def check_password_strength(password: str) -> None:
    minimum = get_settings().auth_min_password_length
    if len(password) < minimum:
        raise ValidationError(f"Password must be at least {minimum} characters")


class AuthService:
    def __init__(
        self,
        db: Session,
        users: UserRepository,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.db = db
        self.users = users
        self.now = now

    def register(self, data: RegisterIn) -> RegisterOut:
        check_password_strength(data.password)
        if self.users.by_email(data.email) is not None:
            raise ConflictError("An account with this email already exists")

        organization = Organization(name=data.company_name, kind=OrganizationKind.CLIENT)
        self.db.add(organization)
        self.db.flush()
        self.db.add(
            User(
                organization_id=organization.id,
                email=data.email,
                full_name=data.full_name,
                phone=data.phone,
                password_hash=hash_password(data.password),
                role=UserRole.CLIENT_ADMIN,
                status=UserStatus.PENDING,
            )
        )
        self.db.add(
            OrganizationCarrier(organization_id=organization.id, usdot_number=data.usdot_number)
        )
        self.db.commit()
        return RegisterOut(
            status=UserStatus.PENDING.value,
            message="Thanks for registering. STS will review your account; you can log in once "
            "it is approved.",
        )

    def login(self, data: LoginIn) -> User:
        user = self.users.by_email(data.email)
        if user is None:
            verify_password(data.password, _DUMMY_HASH)
            raise UnauthorizedError("Email or password is incorrect")
        if not verify_password(data.password, user.password_hash):
            raise UnauthorizedError("Email or password is incorrect")
        if user.status == UserStatus.PENDING:
            raise AccountPendingError("Your account is waiting for approval by STS")
        if user.status == UserStatus.DISABLED:
            raise AccountDisabledError("This account has been disabled. Contact STS for help")
        user.last_login_at = self.now()
        self.db.commit()
        return user

    def user_out(self, user: User) -> UserOut:
        organization = self.users.organization(user.organization_id)
        return UserOut(**_user_fields(user, organization))

    # --- STS admin -----------------------------------------------------------------------------

    def list_users(self, status: UserStatus | None) -> list[AdminUserOut]:
        return [self._admin_out(user) for user in self.users.list_users(status)]

    def approve(self, user_id: int) -> AdminUserOut:
        user = self._get(user_id)
        user.status = UserStatus.ACTIVE
        for link in self.users.organization_carriers(user.organization_id):
            link.verified = True
        self.db.commit()
        return self._admin_out(user)

    def disable(self, user_id: int, acting_user: User) -> AdminUserOut:
        user = self._get(user_id)
        if user.id == acting_user.id:
            raise ValidationError("You cannot disable your own account")
        user.status = UserStatus.DISABLED
        self.db.commit()
        return self._admin_out(user)

    def add_carrier(self, user_id: int, usdot_number: int) -> AdminUserOut:
        """STS links a carrier to a client's organization, already verified (STS checked it)."""
        user = self._get(user_id)
        if user.role.is_staff:
            raise ValidationError("STS staff accounts have no carriers of their own")
        links = self.users.organization_carriers(user.organization_id)
        existing = next((link for link in links if link.usdot_number == usdot_number), None)
        if existing is None:
            self.db.add(
                OrganizationCarrier(
                    organization_id=user.organization_id, usdot_number=usdot_number, verified=True
                )
            )
        else:
            existing.verified = True
        self.db.commit()
        return self._admin_out(user)

    def _get(self, user_id: int) -> User:
        user = self.users.get(user_id)
        if user is None:
            raise NotFoundError(f"No user with id {user_id}")
        return user

    def _admin_out(self, user: User) -> AdminUserOut:
        organization = self.users.organization(user.organization_id)
        links = self.users.organization_carriers(user.organization_id)
        usdots = [link.usdot_number for link in links]
        return AdminUserOut(
            **_user_fields(user, organization),
            usdot_numbers=usdots,
            carrier_checks=self._contact_checks(user, usdots),
        )

    def _contact_checks(self, user: User, usdots: list[int]) -> list[CarrierContactCheckOut]:
        """Compare the sign-up's phone and email with FMCSA's record for each USDOT it gave."""
        carriers = self.users.carriers_by_usdot(usdots)
        checks = []
        for usdot in usdots:
            carrier = carriers.get(usdot)
            phones = self.users.current_phones(carrier.id) if carrier else set()
            fmcsa_email = (carrier.email or "").strip().lower() if carrier else ""
            checks.append(
                CarrierContactCheckOut(
                    usdot_number=usdot,
                    legal_name=carrier.legal_name if carrier else None,
                    phone_matches_fmcsa=(user.phone in phones) if phones and user.phone else None,
                    email_matches_fmcsa=(user.email == fmcsa_email) if fmcsa_email else None,
                )
            )
        return checks

    # --- Client portal -------------------------------------------------------------------------

    def portal_overview(self, user: User) -> PortalOverviewOut:
        organization = self.users.organization(user.organization_id)
        links = self.users.organization_carriers(user.organization_id, verified_only=True)
        carriers = self.users.carriers_by_usdot([link.usdot_number for link in links])
        return PortalOverviewOut(
            organization_name=organization.name if organization else "",
            carriers=[
                PortalCarrierOut(
                    usdot_number=link.usdot_number,
                    legal_name=c.legal_name if c else None,
                    dba_name=c.dba_name if c else None,
                    registration_status=c.registration_status if c else None,
                    last_refreshed_at=c.last_refreshed_at if c else None,
                )
                for link in links
                for c in [carriers.get(link.usdot_number)]
            ],
        )


def _user_fields(user: User, organization: Organization | None) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role.value,
        "status": user.status.value,
        "portal": "internal" if user.role.is_staff else "client",
        "organization_id": user.organization_id,
        "organization_name": organization.name if organization else "",
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }
