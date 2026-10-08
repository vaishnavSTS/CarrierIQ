"""Census row -> canonical values. Expectations follow the data dictionary and the live API."""

from datetime import date
from typing import Any

import pytest

from app.core.exceptions import SourceDataError
from app.ingestion.company_census_normalizer import (
    AddressValues,
    AuthorityValues,
    DomainValues,
    OfficerValues,
    PhoneValues,
    email_domain,
    normalize_census_row,
    normalize_phone,
)
from app.models.enums import AddressType, DocketPrefix, DomainOrigin, PhoneType
from tests.ingestion.helpers import load_census_rows


def real_row(**overrides: Any) -> dict[str, Any]:
    row = {**load_census_rows()[0], **overrides}
    return {k: v for k, v in row.items() if v is not None}


def test_real_record_is_normalized() -> None:
    record = normalize_census_row(real_row())

    carrier = record.carrier
    assert carrier.usdot_number == 295017
    assert carrier.legal_name == "UNITED MOVING AND STORAGE INC"
    assert carrier.dba_name is None
    assert carrier.entity_type == "C;S"
    assert carrier.registration_status == "ACTIVE"
    assert carrier.email == "cloidhamer@united-moving.com"
    assert carrier.fleet_size == 18
    assert carrier.driver_count == 24
    assert carrier.safety_rating is None
    assert carrier.first_registered_date == date(1987, 6, 10)
    assert carrier.last_mcs150_date == date(2025, 5, 28)

    assert record.addresses == (
        AddressValues(
            address_type=AddressType.PHYSICAL,
            street="1770 NE FUSON RD",
            city="BREMERTON",
            state="WA",
            zip="98311-3729",
            county_code="035",
            country="US",
            undeliverable=False,
        ),
        AddressValues(
            address_type=AddressType.MAILING,
            street="1770 NE FUSON RD",
            city="BREMERTON",
            state="WA",
            zip="98311",
            county_code="035",
            country="US",
            undeliverable=False,
        ),
    )
    assert record.phones == (
        PhoneValues(phone_type=PhoneType.OFFICE, number_normalized="3604794800"),
        PhoneValues(phone_type=PhoneType.FAX, number_normalized="3603732751"),
    )
    assert record.officers == (
        OfficerValues(name="SHAUNA WASHBURN", raw_value="SHAUNA WASHBURN"),
        OfficerValues(name="CRAIG LOIDHAMER", raw_value="CRAIG LOIDHAMER"),
    )
    assert record.domains == (DomainValues(domain="united-moving.com", origin=DomainOrigin.EMAIL),)
    assert record.authorities == (
        AuthorityValues(docket_prefix=DocketPrefix.MC, docket_number="139446", status="ACTIVE"),
    )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("13604794800", "3604794800"),  # US country code dropped
        ("(360) 479-4800", "3604794800"),
        ("0000000000", None),  # placeholder seen on the live API
        ("01012022", None),  # a date typed into the phone field (USDOT 3695639)
        ("1", None),
        ("030433780", None),  # 9 digits
        ("", None),
        (None, None),
    ],
)
def test_normalize_phone(raw: str | None, expected: str | None) -> None:
    assert normalize_phone(raw) == expected


def test_placeholder_cell_phone_is_skipped() -> None:
    record = normalize_census_row(real_row(cell_phone="0000000000"))

    assert PhoneType.CELL not in {p.phone_type for p in record.phones}


@pytest.mark.parametrize(
    ("email", "expected"),
    [
        ("Ops@United-Moving.COM", "united-moving.com"),
        ("no-at-sign.com", None),
        ("two@@signs.com", None),
        ("user@localhost", None),
        (None, None),
    ],
)
def test_email_domain(email: str | None, expected: str | None) -> None:
    assert email_domain(email) == expected


@pytest.mark.parametrize(
    ("code", "expected"), [("A", "ACTIVE"), ("I", "INACTIVE"), ("P", "PENDING"), ("X", "X")]
)
def test_registration_status_codes(code: str, expected: str) -> None:
    record = normalize_census_row(real_row(status_code=code))

    assert record.carrier.registration_status == expected


def test_safety_rating_codes() -> None:
    record = normalize_census_row(real_row(safety_rating="C", safety_rating_date="20240115"))

    assert record.carrier.safety_rating == "CONDITIONAL"
    assert record.carrier.safety_rating_date == date(2024, 1, 15)


@pytest.mark.parametrize("bad", ["00000000", "20251340", "2025", "abcdefgh"])
def test_invalid_dates_become_none(bad: str) -> None:
    assert normalize_census_row(real_row(mcs150_date=bad)).carrier.last_mcs150_date is None


def test_undeliverable_flags() -> None:
    record = normalize_census_row(real_row(undeliv_phy="U", carrier_mailing_und_date="20250917"))

    physical, mailing = record.addresses
    assert physical.undeliverable is True
    assert mailing.undeliverable is True


def test_address_without_any_location_is_skipped() -> None:
    row = {k: v for k, v in real_row().items() if not k.startswith("carrier_mailing_")}

    record = normalize_census_row(row)

    assert [a.address_type for a in record.addresses] == [AddressType.PHYSICAL]


def test_officer_text_is_trimmed_but_raw_value_kept() -> None:
    record = normalize_census_row(
        real_row(company_officer_1="  JOHN   DOE  PRESIDENT ", company_officer_2=None)
    )

    assert record.officers == (
        OfficerValues(name="JOHN DOE PRESIDENT", raw_value="  JOHN   DOE  PRESIDENT "),
    )


def test_all_three_dockets_and_pending_status() -> None:
    record = normalize_census_row(
        real_row(
            docket2prefix="MX",
            docket2="000123",
            docket2_status_code="P",
            docket3prefix="ZZ",  # unknown prefix: skipped
            docket3="999",
        )
    )

    assert record.authorities == (
        AuthorityValues(docket_prefix=DocketPrefix.MC, docket_number="139446", status="ACTIVE"),
        AuthorityValues(docket_prefix=DocketPrefix.MX, docket_number="000123", status="PENDING"),
    )


def test_missing_optional_fields_are_none() -> None:
    row = {"dot_number": "42", "legal_name": "TINY CARRIER"}

    record = normalize_census_row(row)

    assert record.carrier.fleet_size is None
    assert record.carrier.registration_status is None
    assert record.addresses == record.phones == record.officers == record.authorities == ()


@pytest.mark.parametrize(
    "row",
    [
        {"legal_name": "NO DOT NUMBER"},
        {"dot_number": "abc", "legal_name": "BAD DOT NUMBER"},
        {"dot_number": "42"},
        {"dot_number": "42", "legal_name": "   "},
    ],
)
def test_record_without_identity_is_rejected(row: dict[str, Any]) -> None:
    with pytest.raises(SourceDataError):
        normalize_census_row(row)


def test_operation_classification() -> None:
    assert (
        normalize_census_row(real_row()).carrier.operation_classification
        == "PRIVATE PROPERTY;AUTHORIZED FOR HIRE"
    )
    tidy = normalize_census_row(real_row(classdef=" private property ;  ")).carrier
    assert tidy.operation_classification == "PRIVATE PROPERTY"
    assert normalize_census_row(real_row(classdef=None)).carrier.operation_classification is None
