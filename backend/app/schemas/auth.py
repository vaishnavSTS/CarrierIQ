"""Login, registration, account approval, the client portal's carrier list and the broker
portal's brokerage."""

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Deliberately loose: one "@", a dot in the domain, no spaces. The real check is that STS
# approves the account.
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_phone(value: str) -> str:
    """US / Canada number as 10 digits, the form FMCSA phones are stored in (phones table)."""
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        raise ValueError("Enter a 10-digit US or Canada phone number")
    return digits


def _email(value: str) -> str:
    value = value.strip().lower()
    if not _EMAIL.match(value):
        raise ValueError("Enter a valid email address")
    return value


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)

    _normalize_email = field_validator("email")(_email)


class RegisterIn(BaseModel):
    """A client signs up their company. The account waits for STS approval."""

    full_name: str = Field(min_length=1, max_length=200)
    company_name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=254)
    phone: str = Field(max_length=30)  # mobile number; stored as 10 digits
    password: str = Field(max_length=200)  # minimum length is a setting, checked by the service
    usdot_number: int = Field(gt=0, lt=100_000_000)

    _normalize_email = field_validator("email")(_email)
    _normalize_phone = field_validator("phone")(normalize_phone)

    @field_validator("full_name", "company_name")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value


class GoogleSignupIn(BaseModel):
    """Finishing a Google sign-up: Google gave the name and a verified email; we need the rest."""

    company_name: str = Field(min_length=1, max_length=200)  # compared with FMCSA's name
    phone: str = Field(max_length=30)
    usdot_number: int = Field(gt=0, lt=100_000_000)

    _normalize_phone = field_validator("phone")(normalize_phone)

    @field_validator("company_name")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value


class BrokerIdIn(BaseModel):
    """The brokerage's MC number (or USDOT), checked against FMCSA for active broker authority."""

    id_kind: Literal["MC", "USDOT"]
    id_number: int = Field(gt=0, lt=100_000_000)


class BrokerRegisterIn(BrokerIdIn):
    """A freight broker signs up their brokerage."""

    full_name: str = Field(min_length=1, max_length=200)
    company_name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=254)
    phone: str = Field(max_length=30)
    password: str = Field(max_length=200)

    _normalize_email = field_validator("email")(_email)
    _normalize_phone = field_validator("phone")(normalize_phone)

    @field_validator("full_name", "company_name")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value


class BrokerGoogleSignupIn(BrokerIdIn):
    """Finishing a broker's Google sign-up."""

    company_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(max_length=30)

    _normalize_phone = field_validator("phone")(normalize_phone)

    @field_validator("company_name")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value


class GoogleSignupPendingOut(BaseModel):
    email: str
    full_name: str
    portal: str = "client"  # client | broker: which sign-up the Google round trip started from


class AuthOptionsOut(BaseModel):
    google: bool  # show "Continue with Google"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    phone: str | None  # 10 digits; clients give one at sign-up, staff may have none
    role: str  # STS_ADMIN | STS_ANALYST | CLIENT_ADMIN | CLIENT_USER | BROKER_ADMIN | BROKER_USER
    status: str  # PENDING | ACTIVE | DISABLED
    portal: str  # internal | client | broker: where this user lands after logging in
    organization_id: int
    organization_name: str
    created_at: datetime
    last_login_at: datetime | None


class SeenOut(BaseModel):
    marked: int  # new sign-ups now marked as seen


class AddCarrierIn(BaseModel):
    usdot_number: int = Field(gt=0, lt=100_000_000)


class CarrierContactCheckOut(BaseModel):
    """Does the sign-up's phone / email match FMCSA's census record for a USDOT number they gave?

    None means CarrierIQ has not loaded that carrier yet (open its profile to load it) or FMCSA
    lists no such contact: no answer either way.
    """

    usdot_number: int
    legal_name: str | None
    phone_matches_fmcsa: bool | None
    email_matches_fmcsa: bool | None
    # The company name they gave against FMCSA's legal or DBA name, ignoring case, punctuation
    # and endings such as LLC / Inc.
    company_matches_fmcsa: bool | None


class AdminUserOut(UserOut):
    """A user as an STS admin sees them, with the USDOT numbers their organization named."""

    usdot_numbers: list[int]
    is_new: bool  # a client or broker sign-up STS has not seen yet (the Accounts pop-up)
    carrier_checks: list[CarrierContactCheckOut]
    broker: "BrokerOut | None" = None  # broker accounts: the brokerage FMCSA confirmed


class PortalCarrierOut(BaseModel):
    usdot_number: int
    legal_name: str | None  # None until CarrierIQ has loaded the carrier
    dba_name: str | None
    registration_status: str | None
    last_refreshed_at: datetime | None


class PortalOverviewOut(BaseModel):
    organization_name: str
    carriers: list[PortalCarrierOut]


class BrokerOut(BaseModel):
    """A brokerage's FMCSA identity, as checked at sign-up."""

    organization_name: str
    usdot_number: int | None
    docket_number: str | None  # "MC261603"
    authority_source: str | None  # MOTUS | LEGACY_LI
    authority_checked_at: datetime | None


AdminUserOut.model_rebuild()  # BrokerOut is defined after it
