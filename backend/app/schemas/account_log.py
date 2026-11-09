"""The account log, as STS admins read it (Account logs page)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.enums import UserRole, UserStatus

# Which events a filter shows (app/services/account_log.py GROUPS)
LogGroup = Literal["all", "logins", "failed", "account"]


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
