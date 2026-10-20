"""How often a state pulls a PrePass-equipped truck in for inspection, by the carrier's ISS.

Each state sets its own weigh-station pull-in rate for each ISS range (PrePass does not set
them); one row is one state's rate for one range. state_code "GENERAL" is the rate for states
not listed. Seeded by migration 0023 from the PrePass table STS shares with customers; a state
can change its rates at any time, so each row carries its source and effective date.
"""

from datetime import date

from sqlalchemy import Date, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class IssPullInRate(IdMixin, Base):
    __tablename__ = "iss_pull_in_rates"
    __table_args__ = (
        UniqueConstraint("state_code", "min_score", name="uq_iss_pull_in_rates_state_min_score"),
    )

    state_code: Mapped[str] = mapped_column(String(10))  # "GENERAL" or a 2-letter state code
    min_score: Mapped[int] = mapped_column(SmallInteger)  # ISS range, inclusive
    max_score: Mapped[int] = mapped_column(SmallInteger)
    pull_in_percent: Mapped[int | None] = mapped_column(SmallInteger)  # None: no rate given
    source: Mapped[str] = mapped_column(Text)
    effective_date: Mapped[date] = mapped_column(Date)
