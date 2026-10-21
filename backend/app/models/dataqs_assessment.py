"""STS's assessment of a DataQs case (docs/DataQ.md, Phase 3).

A specialist checks carrier authority, record identity, request category, timing, duplicates,
evidence and the state's plan (`checks`), then records an outcome. `carrier_message` is what the
carrier sees; `internal_note` is for STS staff only and never leaves the staff API. Every
assessment is kept: a later one adds a row, it does not replace the earlier one.
"""

from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsAssessmentOutcome, enum_type
from app.models.mixins import IdMixin


class DataQsAssessment(IdMixin, Base):
    __tablename__ = "dataqs_assessments"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    assessor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    outcome: Mapped[DataQsAssessmentOutcome] = mapped_column(
        enum_type(DataQsAssessmentOutcome, "dataqs_assessment_outcome", length=30)
    )
    checks: Mapped[dict[str, Any]] = mapped_column(JSONB)  # {check: {"result": .., "note": ..}}
    carrier_message: Mapped[str | None] = mapped_column(Text)
    internal_note: Mapped[str | None] = mapped_column(Text)
