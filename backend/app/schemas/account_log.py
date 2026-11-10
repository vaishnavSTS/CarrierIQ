"""The account log, as STS admins read it (Account logs page)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import UserRole, UserStatus

# Which events a filter shows (app/services/account_log.py GROUPS)
LogGroup = Literal["all", "logins", "failed", "account", "activity"]


class AccountEventOut(BaseModel):
    id: int
    at: datetime
    event: str  # an AccountEventKind
    detail: str | None
    user_id: int | None  # None: no such account, or deleted since
    account_name: str | None
    account_email: str | None  # the account's email now, or the one on the row
    actor_name: str | None  # the STS admin who did it; None: the account holder
    ip: str | None
    user_agent: str | None
    usdot_number: int | None = None  # activity: the carrier searched for or opened
    carrier_name: str | None = None  # its name, when Carrier Safety Scan has it
    page: str | None = None  # activity: the carrier page tab opened (e.g. "safety")


# The carrier page tabs a view can name (frontend pages/CarrierProfilePage.tsx TABS).
CarrierTab = Literal[
    "identity",
    "authority",
    "insurance",
    "safety",
    "equipment",
    "network",
    "chameleon",
    "safety-score-report",
    "compliance",
    "invoices",
    "intelligence",
    "timeline",
]


class CarrierViewIn(BaseModel):
    usdot_number: int = Field(gt=0, lt=100_000_000)
    tab: CarrierTab


class AccountSummaryOut(BaseModel):
    """One account, above its history."""

    id: int
    full_name: str
    email: str
    organization_name: str | None
    role: UserRole
    status: UserStatus
    created_at: datetime
    last_login_at: datetime | None
    logins_30d: int
    failed_logins_30d: int
    last_failed_login_at: datetime | None


class AccountLogOut(BaseModel):
    events: list[AccountEventOut]  # newest first
    has_more: bool  # older events: ask again with before=<the last id>
    account: AccountSummaryOut | None  # when the log is for one account
