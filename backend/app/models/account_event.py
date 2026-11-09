"""Account log: every login, failed login, logout and change to an account, append-only.

STS admins read it on the Account logs page (all accounts, or one account's history). Rows are
never changed or removed: when an account is deleted its rows stay, with `user_id` cleared and the
email kept. A failed login for an email with no account is kept too, under the email as typed.
"""

from enum import StrEnum

from sqlalchemy import BigInteger, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class AccountEventKind(StrEnum):
    # Logins
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    LOGIN_FAILED = "LOGIN_FAILED"
    # By the account holder
    SIGNED_UP = "SIGNED_UP"
    EMAIL_CONFIRMED = "EMAIL_CONFIRMED"
    PASSWORD_RESET_ASKED = "PASSWORD_RESET_ASKED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    # By an STS admin
    INVITED = "INVITED"
    DISABLED = "DISABLED"
    REACTIVATED = "REACTIVATED"
    DELETED = "DELETED"
    CARRIER_LINKED = "CARRIER_LINKED"
    CLAIM_RELEASED = "CLAIM_RELEASED"


class AccountEvent(IdMixin, Base):
    __tablename__ = "account_events"
    __table_args__ = (Index("ix_account_events_user_id_id", "user_id", "id"),)

    # The account; None for an email with no account, or once the account is deleted
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    email: Mapped[str | None] = mapped_column(String(254))  # the account's, or as typed
    event: Mapped[str] = mapped_column(String(30))  # an AccountEventKind
    detail: Mapped[str | None] = mapped_column(String(300))  # e.g. "Wrong password", "Google"
    # The STS admin who did it; None when the account holder did
    actor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL")
    )
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(400))
