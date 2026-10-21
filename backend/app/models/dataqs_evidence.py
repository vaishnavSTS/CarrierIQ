"""Evidence a carrier or STS uploads for a DataQs case, and which issues each file supports.

The original file is never changed: a redacted copy for submission is a new row pointing at its
original (`original_id`). `sha256` supports integrity checks, not a claim that the content is
true. Every file must be linked to at least one issue with a note on why it is relevant
(dataqs_evidence_links). Files live in private storage under `object_key`; downloads go through
dataqs_access.py, never a public URL.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsScanStatus, enum_type
from app.models.mixins import IdMixin


class DataQsEvidence(IdMixin, Base):
    __tablename__ = "dataqs_evidence"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    object_key: Mapped[str] = mapped_column(String(500), unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    original_id: Mapped[int | None] = mapped_column(  # set on a redacted copy
        BigInteger, ForeignKey("dataqs_evidence.id")
    )
    file_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    document_date: Mapped[date | None] = mapped_column(Date)
    scan_status: Mapped[DataQsScanStatus] = mapped_column(
        enum_type(DataQsScanStatus, "dataqs_scan_status"),
        default=DataQsScanStatus.PENDING,
        server_default=DataQsScanStatus.PENDING.value,
    )
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uploaded_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    source_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # e.g. ELD export info


class DataQsEvidenceLink(IdMixin, Base):
    __tablename__ = "dataqs_evidence_links"
    __table_args__ = (
        UniqueConstraint("evidence_id", "issue_id", name="uq_dataqs_evidence_links_evidence_issue"),
    )

    evidence_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_evidence.id", ondelete="CASCADE"), index=True
    )
    issue_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_issues.id", ondelete="CASCADE"), index=True
    )
    relevance: Mapped[str] = mapped_column(Text)
