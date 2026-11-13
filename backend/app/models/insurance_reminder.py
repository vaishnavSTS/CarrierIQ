"""Insurance renewal reminders (services/insurance_reminders.py).

`insurance_reminders` records each email sent, so a recipient gets each reminder for a policy year
once. `insurance_reminder_opt_outs` holds who unsubscribed, by a keyed hash of the email address
(the unsubscribe link carries the hash, never the address).
"""

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class InsuranceReminder(IdMixin, Base):
    __tablename__ = "insurance_reminders"
    __table_args__ = (
        UniqueConstraint(
            "insurance_id",
            "end_date",
            "days_before",
            "recipient",
            name="uq_insurance_reminders_once",
        ),
    )

    insurance_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("insurance.id", ondelete="CASCADE"), index=True
    )
    usdot_number: Mapped[int] = mapped_column(BigInteger, index=True)
    end_date: Mapped[date] = mapped_column(Date)  # the estimated end it was about
    days_before: Mapped[int] = mapped_column(Integer)  # the reminder stage, e.g. 30 or 7
    recipient: Mapped[str] = mapped_column(String(254))  # the intended address (not a test one)
    source: Mapped[str] = mapped_column(String(20))  # CLIENT (account email) | CENSUS (MCS-150)


class InsuranceReminderOptOut(IdMixin, Base):
    __tablename__ = "insurance_reminder_opt_outs"

    email_hash: Mapped[str] = mapped_column(String(64), unique=True)
