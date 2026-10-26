"""DataQs filing packages, the carrier's authorizations, and STS's filing attempts.

A package is frozen once built: narrative plus a manifest of the exact evidence versions and their
hashes, summed up in `manifest_hash`. Any material edit makes a new package version and sets
`invalidated_at` on the old one, so an approval of the old hash can no longer be filed.

Two kinds of authorization are kept apart: general consent for STS to act on the case, and
approval to file one exact package (bound to its `package_hash`).

Filing is manual (no government API): a submission attempt is CONFIRMED only once the
acknowledgement is recorded. A timed-out attempt stays UNCONFIRMED and blocks a retry until
reconciled. Filing attempts store only the account identity; carrier passwords are stored
separately as encrypted contact data, and MFA secrets are never stored.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DataQsAttemptStatus, DataQsAuthorizationKind, enum_type
from app.models.mixins import IdMixin, UpdatedAtMixin


class DataQsPackage(IdMixin, Base):
    __tablename__ = "dataqs_packages"
    __table_args__ = (
        UniqueConstraint("case_id", "package_version", name="uq_dataqs_packages_case_version"),
    )

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    package_version: Mapped[int] = mapped_column(Integer)
    narrative: Mapped[str] = mapped_column(Text)
    manifest: Mapped[dict[str, Any]] = mapped_column(JSONB)  # issues, evidence versions + hashes
    manifest_hash: Mapped[str] = mapped_column(String(64))
    created_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DataQsAuthorization(IdMixin, Base):
    __tablename__ = "dataqs_authorizations"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[DataQsAuthorizationKind] = mapped_column(
        enum_type(DataQsAuthorizationKind, "dataqs_authorization_kind")
    )
    signer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    signer_name: Mapped[str] = mapped_column(String(200))
    signer_title: Mapped[str | None] = mapped_column(String(100))
    authority_check: Mapped[dict[str, Any]] = mapped_column(JSONB)  # what was verified, and when
    scope: Mapped[str] = mapped_column(Text)
    terms_version: Mapped[str] = mapped_column(String(20))  # version of the consent text shown
    package_id: Mapped[int | None] = mapped_column(  # PACKAGE_APPROVAL only
        BigInteger, ForeignKey("dataqs_packages.id")
    )
    package_hash: Mapped[str | None] = mapped_column(String(64))
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DataQsSubmissionAttempt(IdMixin, UpdatedAtMixin, Base):
    __tablename__ = "dataqs_submission_attempts"
    __table_args__ = (
        UniqueConstraint(
            "case_id", "idempotency_key", name="uq_dataqs_submission_attempts_case_key"
        ),
    )

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    package_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("dataqs_packages.id"))
    status: Mapped[DataQsAttemptStatus] = mapped_column(
        enum_type(DataQsAttemptStatus, "dataqs_attempt_status"),
        default=DataQsAttemptStatus.STARTED,
        server_default=DataQsAttemptStatus.STARTED.value,
    )
    filed_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    filing_account: Mapped[str | None] = mapped_column(String(200))  # identity only
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    filed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    gov_request_id: Mapped[str | None] = mapped_column(String(50))
    assigned_agency: Mapped[str | None] = mapped_column(String(200))
    receipt: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # acknowledgement as recorded
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Why an attempt was left unconfirmed or abandoned, e.g. "portal timed out after Submit".
    note: Mapped[str | None] = mapped_column(Text)


class DataQsFilingProof(IdMixin, Base):
    """The confirmation DataQs gave when STS filed (a PDF or a screenshot), uploaded by STS staff
    on the filing attempt. The carrier sees the proofs of confirmed filings on their case."""

    __tablename__ = "dataqs_filing_proofs"

    case_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_cases.id", ondelete="CASCADE"), index=True
    )
    attempt_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataqs_submission_attempts.id", ondelete="CASCADE"), index=True
    )
    object_key: Mapped[str] = mapped_column(String(500), unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    file_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    uploaded_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
