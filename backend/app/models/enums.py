"""Fixed value sets shared across tables (spec Section 11 conventions, Section 13.1).

Stored as VARCHAR + CHECK constraint rather than native PostgreSQL enums, so adding a value
later is a simple constraint change in a migration.
"""

from enum import StrEnum

from sqlalchemy import Enum


class Confidence(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class Severity(StrEnum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class SignalStatus(StrEnum):
    OPEN = "OPEN"
    REVIEWED = "REVIEWED"
    DISMISSED = "DISMISSED"


class IngestionStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class JobStatus(StrEnum):
    QUEUED = "QUEUED"  # waiting to run, possibly until run_after (a retry backoff)
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"  # gave up after max_attempts


class AddressType(StrEnum):
    PHYSICAL = "PHYSICAL"
    MAILING = "MAILING"


class PhoneType(StrEnum):
    OFFICE = "OFFICE"
    CELL = "CELL"
    FAX = "FAX"


class DomainOrigin(StrEnum):
    EMAIL = "EMAIL"
    WEBSITE = "WEBSITE"


class DocketPrefix(StrEnum):
    MC = "MC"
    MX = "MX"
    FF = "FF"


class OrganizationKind(StrEnum):
    STS = "STS"  # STS itself: its users get the internal portal
    CLIENT = "CLIENT"  # an STS client: its users get the client portal
    BROKER = "BROKER"  # a freight brokerage: its users get the broker portal


class UserRole(StrEnum):
    STS_ADMIN = "STS_ADMIN"  # internal portal + approves client accounts
    STS_ANALYST = "STS_ANALYST"  # internal portal
    CLIENT_ADMIN = "CLIENT_ADMIN"  # client portal, their organization
    CLIENT_USER = "CLIENT_USER"  # client portal, view only
    BROKER_ADMIN = "BROKER_ADMIN"  # broker portal, their brokerage
    BROKER_USER = "BROKER_USER"  # broker portal

    @property
    def is_staff(self) -> bool:
        return self in (UserRole.STS_ADMIN, UserRole.STS_ANALYST)

    @property
    def is_client(self) -> bool:
        return self in (UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)

    @property
    def is_broker(self) -> bool:
        return self in (UserRole.BROKER_ADMIN, UserRole.BROKER_USER)

    @property
    def portal(self) -> str:
        """internal | client | broker: where this role's users land after logging in."""
        return "internal" if self.is_staff else "broker" if self.is_broker else "client"


class UserStatus(StrEnum):
    PENDING = "PENDING"  # registered, waiting for STS approval; cannot log in
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"


def enum_type(enum_cls: type[StrEnum], name: str) -> Enum:
    """VARCHAR column restricted to the enum's values by a CHECK constraint named after `name`."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        length=20,
        values_callable=lambda cls: [member.value for member in cls],
    )
