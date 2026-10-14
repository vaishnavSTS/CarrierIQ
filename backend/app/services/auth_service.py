"""Registration, login, account management and the client portal overview.

Rules:
- A client who registers gets a new CLIENT organization and an ACTIVE CLIENT_ADMIN account, is
  logged in at once and sees the USDOT number they gave in their portal (public FMCSA data only).
  STS is shown each new account once ("new sign-up" pop-up, `seen_at`) and can disable it.
- DISABLED accounts cannot log in (nor can PENDING ones, a status new accounts no longer get).
- Google sign-in (verified emails only) logs in an existing account with that Google id or email.
  Someone new must first give their company, mobile number and USDOT ("finish signing up"); they
  then get the same client account as a password sign-up, with no password.
- A broker who registers gives their brokerage's MC (or USDOT) number; FMCSA must show active
  broker authority for it (services/broker_authority.py). They get a new BROKER organization
  holding that identity and an ACTIVE BROKER_ADMIN account, logged in at once. Brokers can open
  any carrier (broker portal), so no carriers are linked to them.
- STS staff never self-register: they are created with `python -m app.workers.create_staff_user`.
  Google sign-in never creates staff; it only logs in staff accounts that already exist.
"""

import re
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
from app.core.google_oauth import GoogleIdentity
from app.core.security import hash_password, verify_password
from app.models import Organization, OrganizationCarrier, User
from app.models.enums import OrganizationKind, UserRole, UserStatus
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AdminUserOut,
    BrokerGoogleSignupIn,
    BrokerOut,
    BrokerRegisterIn,
    CarrierContactCheckOut,
    GoogleSignupIn,
    LoginIn,
    PortalCarrierOut,
    PortalOverviewOut,
    RegisterIn,
    UserOut,
)
from app.services.broker_authority import BrokerAuthority

# Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
_DUMMY_HASH = hash_password("not-a-real-password")


_COMPANY_ENDINGS = {
    "LLC", "INC", "INCORPORATED", "CO", "COMPANY", "CORP", "CORPORATION", "LTD", "LIMITED",
    "LP", "LLP", "PLLC", "THE",
}  # fmt: skip


def company_key(name: str | None) -> str:
    """A company name reduced for comparison: "Vanek Brothers Trucking Co." and "VANEK
    BROTHERS TRUCKING COMPANY" both become "VANEK BROTHERS TRUCKING"; "&" counts as "AND"."""
    words = re.sub(r"[^A-Z0-9 ]", " ", (name or "").upper().replace("&", " AND ")).split()
    return " ".join(w for w in words if w not in _COMPANY_ENDINGS)


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

    def register(self, data: RegisterIn) -> User:
        check_password_strength(data.password)
        if self.users.by_email(data.email) is not None:
            raise ConflictError("An account with this email already exists")
        return self._create_client(
            email=data.email,
            full_name=data.full_name,
            company_name=data.company_name,
            phone=data.phone,
            usdot_number=data.usdot_number,
            password_hash=hash_password(data.password),
        )

    def _create_client(
        self,
        *,
        email: str,
        full_name: str,
        company_name: str,
        phone: str,
        usdot_number: int,
        password_hash: str | None = None,
        google_sub: str | None = None,
    ) -> User:
        """A new CLIENT organization with one ACTIVE account, ready to log in, and its USDOT
        (unconfirmed: `verified` marks carriers STS itself linked or checked)."""
        organization = Organization(name=company_name, kind=OrganizationKind.CLIENT)
        self.db.add(organization)
        self.db.flush()
        user = User(
            organization_id=organization.id,
            email=email,
            full_name=full_name,
            phone=phone,
            password_hash=password_hash,
            google_sub=google_sub,
            role=UserRole.CLIENT_ADMIN,
            status=UserStatus.ACTIVE,
            last_login_at=self.now(),
        )
        self.db.add(user)
        self.db.add(OrganizationCarrier(organization_id=organization.id, usdot_number=usdot_number))
        self.db.commit()
        return user

    def register_broker(self, data: BrokerRegisterIn, authority: BrokerAuthority) -> User:
        """`authority`: what FMCSA showed for the number the broker gave (checked by the route)."""
        check_password_strength(data.password)
        if self.users.by_email(data.email) is not None:
            raise ConflictError("An account with this email already exists")
        return self._create_broker(
            email=data.email,
            full_name=data.full_name,
            company_name=data.company_name,
            phone=data.phone,
            authority=authority,
            password_hash=hash_password(data.password),
        )

    def _create_broker(
        self,
        *,
        email: str,
        full_name: str,
        company_name: str,
        phone: str,
        authority: BrokerAuthority,
        password_hash: str | None = None,
        google_sub: str | None = None,
    ) -> User:
        organization = Organization(
            name=company_name,
            kind=OrganizationKind.BROKER,
            usdot_number=authority.usdot_number,
            docket_number=authority.docket_number,
            authority_source=authority.source,
            authority_checked_at=self.now(),
        )
        self.db.add(organization)
        self.db.flush()
        user = User(
            organization_id=organization.id,
            email=email,
            full_name=full_name,
            phone=phone,
            password_hash=password_hash,
            google_sub=google_sub,
            role=UserRole.BROKER_ADMIN,
            status=UserStatus.ACTIVE,
            last_login_at=self.now(),
        )
        self.db.add(user)
        self.db.commit()
        return user

    def login(self, data: LoginIn) -> User:
        user = self.users.by_email(data.email)
        if user is None:
            verify_password(data.password, _DUMMY_HASH)
            raise UnauthorizedError("Email or password is incorrect")
        # A Google-only account has no password: it fails here like a wrong password.
        if not verify_password(data.password, user.password_hash or _DUMMY_HASH):
            raise UnauthorizedError("Email or password is incorrect")
        return self._admit(user)

    # --- Google sign-in ------------------------------------------------------------------------

    def google_sign_in(self, identity: GoogleIdentity) -> User | None:
        """The logged-in account, or None when this Google user has no account yet (they must
        finish signing up). Raises for pending or disabled accounts, as password login does."""
        if not identity.email_verified:
            raise UnauthorizedError("Google has not verified this email address")
        user = self.users.by_google_sub(identity.sub) or self.users.by_email(identity.email)
        if user is None:
            return None
        if user.google_sub is None:
            user.google_sub = identity.sub  # first Google sign-in for an existing account
            self.db.commit()
        elif user.google_sub != identity.sub:
            raise UnauthorizedError("This email is linked to a different Google account")
        return self._admit(user)

    def complete_google_signup(self, identity: GoogleIdentity, data: GoogleSignupIn) -> User:
        if self.users.by_google_sub(identity.sub) or self.users.by_email(identity.email):
            raise ConflictError("An account with this email already exists; log in instead")
        return self._create_client(
            email=identity.email,
            full_name=identity.name,
            company_name=data.company_name,
            phone=data.phone,
            usdot_number=data.usdot_number,
            google_sub=identity.sub,
        )

    def complete_google_broker_signup(
        self, identity: GoogleIdentity, data: BrokerGoogleSignupIn, authority: BrokerAuthority
    ) -> User:
        if self.users.by_google_sub(identity.sub) or self.users.by_email(identity.email):
            raise ConflictError("An account with this email already exists; log in instead")
        return self._create_broker(
            email=identity.email,
            full_name=identity.name,
            company_name=data.company_name,
            phone=data.phone,
            authority=authority,
            google_sub=identity.sub,
        )

    def _admit(self, user: User) -> User:
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

    def reactivate(self, user_id: int) -> AdminUserOut:
        """Let a disabled account log in again."""
        user = self._get(user_id)
        user.status = UserStatus.ACTIVE
        self.db.commit()
        return self._admin_out(user)

    def mark_new_accounts_seen(self) -> int:
        """Dismiss the "new sign-up" pop-up: every client account not yet seen is now seen."""
        new = [u for u in self.users.list_users() if u.seen_at is None and not u.role.is_staff]
        for user in new:
            user.seen_at = self.now()
        self.db.commit()
        return len(new)

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
        if user.role.is_broker:
            raise ValidationError("Brokers can already open any carrier")
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
            is_new=user.seen_at is None and not user.role.is_staff,
            carrier_checks=self._contact_checks(user, usdots),
            broker=_broker_out(organization) if user.role.is_broker and organization else None,
        )

    def _contact_checks(self, user: User, usdots: list[int]) -> list[CarrierContactCheckOut]:
        """Compare the sign-up's company, phone and email with FMCSA's record for each USDOT."""
        carriers = self.users.carriers_by_usdot(usdots)
        organization = self.users.organization(user.organization_id)
        company = company_key(organization.name if organization else "")
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
                    company_matches_fmcsa=(
                        company in {company_key(carrier.legal_name), company_key(carrier.dba_name)}
                        if carrier and company
                        else None
                    ),
                )
            )
        return checks

    # --- Client and broker portals -------------------------------------------------------------

    def broker_overview(self, user: User) -> BrokerOut:
        organization = self.users.organization(user.organization_id)
        if organization is None:
            raise NotFoundError("No brokerage for this account")
        return _broker_out(organization)

    def portal_overview(self, user: User) -> PortalOverviewOut:
        organization = self.users.organization(user.organization_id)
        links = self.users.organization_carriers(user.organization_id)
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
        "portal": user.role.portal,
        "organization_id": user.organization_id,
        "organization_name": organization.name if organization else "",
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }


def _broker_out(organization: Organization) -> BrokerOut:
    return BrokerOut(
        organization_name=organization.name,
        usdot_number=organization.usdot_number,
        docket_number=organization.docket_number,
        authority_source=organization.authority_source,
        authority_checked_at=organization.authority_checked_at,
    )
