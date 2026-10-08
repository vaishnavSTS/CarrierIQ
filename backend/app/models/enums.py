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
