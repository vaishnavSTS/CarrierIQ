"""A person who logs in. Emails are stored lower-case, so lookups ignore case.

Only the password's scrypt hash is stored (app/core/security.py). A client who registers starts
PENDING and cannot log in until an STS admin approves them; STS staff are created by an admin.
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
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[UserRole] = mapped_column(enum_type(UserRole, "user_role"))
    status: Mapped[UserStatus] = mapped_column(
        enum_type(UserStatus, "user_status"),
        default=UserStatus.PENDING,
        server_default=UserStatus.PENDING.value,
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
