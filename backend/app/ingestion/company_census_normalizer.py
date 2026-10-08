"""Company Census row -> canonical values (spec Section 19.3: type conversion happens only here).

Pure functions, no database access. Codes follow the MCMIS Company Census data dictionary
(Rev 8, 2026-01-23); quirks noted below were observed on the live API on 2026-10-08.
"""

import logging
import re
from dataclasses import dataclass
from datetime import date
from typing import Any, ClassVar

from app.core.exceptions import SourceDataError
from app.models.enums import AddressType, DocketPrefix, DomainOrigin, PhoneType

logger = logging.getLogger(__name__)

Row = dict[str, Any]

# STATUS_CODE and DOCKETn_STATUS_CODE. The dictionary lists only A/I for dockets, but the API
# also returns P. Unknown codes are kept as received rather than dropped.
STATUS_CODES = {"A": "ACTIVE", "I": "INACTIVE", "P": "PENDING"}
SAFETY_RATINGS = {"S": "SATISFACTORY", "C": "CONDITIONAL", "U": "UNSATISFACTORY"}


@dataclass(frozen=True)
class CarrierValues:
    usdot_number: int
    legal_name: str
    dba_name: str | None
    entity_type: str | None
    registration_status: str | None
    email: str | None
    fleet_size: int | None
    driver_count: int | None
    safety_rating: str | None
    safety_rating_date: date | None
    # ADD_DATE: "created, reactivated, or systematically updated" per the dictionary, so it is
    # the best available registration date, not guaranteed to be the very first one.
    first_registered_date: date | None
    last_mcs150_date: date | None


@dataclass(frozen=True)
class AddressValues:
    IDENTITY: ClassVar[tuple[str, ...]] = ("address_type", "street", "city", "state", "zip")

    address_type: AddressType
    street: str | None
    city: str | None
    state: str | None
    zip: str | None
    county_code: str | None
    country: str | None
    undeliverable: bool


@dataclass(frozen=True)
class PhoneValues:
    IDENTITY: ClassVar[tuple[str, ...]] = ("phone_type", "number_normalized")

    phone_type: PhoneType
    number_normalized: str


@dataclass(frozen=True)
class OfficerValues:
    IDENTITY: ClassVar[tuple[str, ...]] = ("name",)

    # The census field is free text that can hold a name and a title. It is almost always a
    # bare name, so the whole value is kept as the name; titles are not guessed.
    name: str
    raw_value: str


@dataclass(frozen=True)
class DomainValues:
    IDENTITY: ClassVar[tuple[str, ...]] = ("domain", "origin")

    domain: str
    origin: DomainOrigin


@dataclass(frozen=True)
class AuthorityValues:
    docket_prefix: DocketPrefix
    docket_number: str
    status: str | None


ObservedValues = AddressValues | PhoneValues | OfficerValues | DomainValues


@dataclass(frozen=True)
class NormalizedCensusRecord:
    carrier: CarrierValues
    addresses: tuple[AddressValues, ...]
    phones: tuple[PhoneValues, ...]
    officers: tuple[OfficerValues, ...]
    domains: tuple[DomainValues, ...]
    authorities: tuple[AuthorityValues, ...]


def normalize_census_row(row: Row) -> NormalizedCensusRecord:
    usdot_number = _int(row, "dot_number")
    if usdot_number is None or usdot_number <= 0:
        raise SourceDataError(f"Census row has no valid dot_number: {row.get('dot_number')!r}")
    legal_name = _text(row, "legal_name")
    if legal_name is None:
        raise SourceDataError(f"Census row for USDOT {usdot_number} has no legal_name")

    email = _text(row, "email_address")
    email = email.lower() if email else None

    carrier = CarrierValues(
        usdot_number=usdot_number,
        legal_name=legal_name,
        dba_name=_text(row, "dba_name"),
        entity_type=_text(row, "carship"),
        registration_status=_code(row, "status_code", STATUS_CODES),
        email=email,
        fleet_size=_int(row, "power_units"),
        driver_count=_int(row, "total_drivers"),
        safety_rating=_code(row, "safety_rating", SAFETY_RATINGS),
        safety_rating_date=_date(row, "safety_rating_date"),
        first_registered_date=_date(row, "add_date"),
        last_mcs150_date=_date(row, "mcs150_date"),
    )
    return NormalizedCensusRecord(
        carrier=carrier,
        addresses=_addresses(row),
        phones=_phones(row),
        officers=_officers(row),
        domains=_domains(email),
        authorities=_authorities(row, usdot_number),
    )


# North American (US/Canada/Mexico) numbers have 10 digits. The census holds ~28,000 shorter
# values such as "0", "1" or "01012022" (a date); they are not phone numbers and would falsely
# link unrelated carriers in phone matching. They remain in raw_records.
MIN_PHONE_DIGITS = 10


def normalize_phone(value: str | None) -> str | None:
    """Digits only, without the US country code; None for placeholders and junk values."""
    if value is None:
        return None
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) < MIN_PHONE_DIGITS or set(digits) == {"0"}:
        return None
    return digits


def email_domain(email: str | None) -> str | None:
    if not email or email.count("@") != 1:
        return None
    domain = email.split("@")[1].strip().lower().rstrip(".")
    return domain if "." in domain else None


def _addresses(row: Row) -> tuple[AddressValues, ...]:
    physical = AddressValues(
        address_type=AddressType.PHYSICAL,
        street=_text(row, "phy_street"),
        city=_text(row, "phy_city"),
        state=_text(row, "phy_state"),
        zip=_text(row, "phy_zip"),
        county_code=_text(row, "phy_cnty"),
        country=_text(row, "phy_country"),
        undeliverable=_text(row, "undeliv_phy") == "U",
    )
    mailing = AddressValues(
        address_type=AddressType.MAILING,
        street=_text(row, "carrier_mailing_street"),
        city=_text(row, "carrier_mailing_city"),
        state=_text(row, "carrier_mailing_state"),
        zip=_text(row, "carrier_mailing_zip"),
        county_code=_text(row, "carrier_mailing_cnty"),
        country=_text(row, "carrier_mailing_country"),
        # The mailing flag is a date: when the address was found undeliverable.
        undeliverable=_date(row, "carrier_mailing_und_date") is not None,
    )
    return tuple(
        address
        for address in (physical, mailing)
        if any((address.street, address.city, address.state, address.zip))
    )


def _phones(row: Row) -> tuple[PhoneValues, ...]:
    phones = []
    for field, phone_type in (
        ("phone", PhoneType.OFFICE),
        ("cell_phone", PhoneType.CELL),
        ("fax", PhoneType.FAX),
    ):
        number = normalize_phone(_text(row, field))
        if number:
            phones.append(PhoneValues(phone_type=phone_type, number_normalized=number))
    return tuple(phones)


def _officers(row: Row) -> tuple[OfficerValues, ...]:
    officers: list[OfficerValues] = []
    for field in ("company_officer_1", "company_officer_2"):
        raw = row.get(field)
        name = _text(row, field)
        if name and isinstance(raw, str) and all(o.name != name for o in officers):
            officers.append(OfficerValues(name=name, raw_value=raw))
    return tuple(officers)


def _domains(email: str | None) -> tuple[DomainValues, ...]:
    domain = email_domain(email)
    return (DomainValues(domain=domain, origin=DomainOrigin.EMAIL),) if domain else ()


def _authorities(row: Row, usdot_number: int) -> tuple[AuthorityValues, ...]:
    authorities: list[AuthorityValues] = []
    for n in (1, 2, 3):
        prefix = _text(row, f"docket{n}prefix")
        number = _text(row, f"docket{n}")
        if not prefix or not number:
            continue
        if prefix not in DocketPrefix.__members__:
            logger.warning("USDOT %d: skipping docket with unknown prefix %r", usdot_number, prefix)
            continue
        authorities.append(
            AuthorityValues(
                docket_prefix=DocketPrefix(prefix),
                docket_number=number,
                status=_code(row, f"docket{n}_status_code", STATUS_CODES),
            )
        )
    return tuple(authorities)


def _text(row: Row, field: str) -> str | None:
    """Trimmed text with inner whitespace collapsed; None when missing or blank."""
    value = row.get(field)
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def _code(row: Row, field: str, meanings: dict[str, str]) -> str | None:
    code = _text(row, field)
    if code is None:
        return None
    return meanings.get(code.upper(), code)


def _int(row: Row, field: str) -> int | None:
    value = _text(row, field)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _date(row: Row, field: str) -> date | None:
    """YYYYMMDD -> date. Placeholders such as 00000000 and impossible dates become None."""
    value = _text(row, field)
    if value is None or len(value) != 8 or not value.isdigit():
        return None
    try:
        return date(int(value[:4]), int(value[4:6]), int(value[6:]))
    except ValueError:
        return None
