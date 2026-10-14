"""One month of Estimated ISS lookup tables (app/intelligence/iss_estimate.py).

Built by the `build_iss_reference` job from FMCSA's national SMS file: the sorted BASIC measures
of every peer group and the spread of each ISS band, sampled small enough (~150 KB) to keep one
row per month instead of the ~677,000-row file. Estimates name the month they were made from.
"""

from datetime import date
from typing import Any

from sqlalchemy import Date, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import IdMixin


class IssReference(IdMixin, Base):
    __tablename__ = "iss_references"

    data_month: Mapped[date] = mapped_column(Date, unique=True)  # first day of the FMCSA month
    version: Mapped[str] = mapped_column(String(20))  # e.g. "iss-est v1"
    dataset_id: Mapped[str] = mapped_column(String(20))  # e.g. 4y6x-dmck
    carriers: Mapped[int]  # rows in FMCSA's file
    tables: Mapped[dict[str, Any]] = mapped_column(JSONB)
