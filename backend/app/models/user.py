"""A person who logs in. Emails are stored lower-case, so lookups ignore case.

Only the password's scrypt hash is stored (app/core/security.py); Google sign-in stores Google's
stable account id (`google_sub`) instead of, or as well as, a password. A client who registers is
ACTIVE and logged in at once; STS sees the new account in a pop-up (`seen_at`). STS staff are
created by an admin. (PENDING is no longer given to new accounts.)
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import UserRole, UserStatus, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class User(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "users"

    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(254), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(20))  # 10 digits, as phones.number_normalized
    # None for accounts that only sign in with Google.
    password_hash: Mapped[str | None] = mapped_column(String(300))
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)  # Google account id
    role: Mapped[UserRole] = mapped_column(enum_type(UserRole, "user_role"))
    status: Mapped[UserStatus] = mapped_column(
        enum_type(UserStatus, "user_status"),
        default=UserStatus.PENDING,
        server_default=UserStatus.PENDING.value,
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When an STS admin dismissed the "new sign-up" pop-up for this account; None = new.
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The $25/month subscription (app/services/subscription.py). None = never billed: STS staff and
    # accounts made before subscriptions began. Otherwise the free trial ends then.
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Stripe's subscription status (active, past_due, canceled, ...), kept current by its webhook.
    subscription_status: Mapped[str | None] = mapped_column(String(30))
    subscription_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64))
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(64), index=True)
