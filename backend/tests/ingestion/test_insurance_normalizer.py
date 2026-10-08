"""Insurance filings (Motus and legacy L&I) -> canonical values, using real rows."""

from datetime import date
from decimal import Decimal
from typing import Any

import pytest

from app.ingestion.insurance_filings import legacy_docket
from app.ingestion.insurance_normalizer import (
    legacy_current,
    legacy_past,
    motus_current,
    motus_past,
)
from app.models.enums import DocketPrefix
from tests.ingestion.helpers import load_insurance_rows

FROZEN = date(2026, 5, 14)
TODAY = date(2026, 10, 8)


def rows(dataset_id: str) -> list[dict[str, Any]]:
    return load_insurance_rows()[dataset_id]


def by_type(values: list[Any], kind: str) -> Any:
    return next(v for v in values if v.insurance_type == kind)


def test_motus_current_filings() -> None:
    filings = [v for r in rows("c5y8-a4uz") if (v := motus_current(r, TODAY))]

    bipd = by_type(filings, "BIPD")
    assert (bipd.form_code, bipd.insurance_class) == ("91X", "P")  # "BMC-" prefix dropped
    assert bipd.coverage_amount == Decimal("1000000.00")
    assert bipd.insurer == "Vanliner Insurance Company"
    assert (bipd.policy_number, bipd.effective_date) == ("MRV 3254703-17", date(2025, 1, 1))
    assert (bipd.status, bipd.on_file, bipd.source_system, bipd.status_as_of) == (
        "ON_FILE",
        True,
        "MOTUS",
        TODAY,
    )
    cargo = by_type(filings, "CARGO")
    assert cargo.form_code == "34"


def test_legacy_current_filings_match_motus_for_the_same_policies() -> None:
    motus = [v for r in rows("c5y8-a4uz") if (v := motus_current(r, TODAY))]
    legacy = [v for r in rows("ypjt-5ydn") if (v := legacy_current(r, FROZEN))]

    bipd = by_type(legacy, "BIPD")
    assert bipd.coverage_amount == by_type(motus, "BIPD").coverage_amount  # thousands -> dollars
    assert by_type(legacy, "BIPD").identity() == by_type(motus, "BIPD").identity()
    assert (bipd.source_system, bipd.status_as_of) == ("LEGACY_LI", FROZEN)
    assert by_type(legacy, "CARGO").coverage_amount is None  # legacy gives 0 for non-BI&PD


def test_legacy_past_filings() -> None:
    past = [v for r in rows("6sqe-dvqs") if (v := legacy_past(r, FROZEN))]

    assert len(past) == 10
    cancelled = next(v for v in past if v.policy_number == "TRU100515")
    assert (cancelled.status, cancelled.insurance_type) == ("CANCELLED", "BIPD")
    assert (cancelled.effective_date, cancelled.termination_date) == (
        date(1988, 3, 1),
        date(2003, 4, 17),
    )
    assert cancelled.coverage_amount == Decimal("1000000.00")
    assert {v.status for v in past} == {"CANCELLED", "REPLACED"}
    assert not any(v.on_file for v in past)


def test_motus_past_filing() -> None:
    row = {
        "docket_number": "FF12038",
        "usdot_number": "2434068",
        "ins_form_code": "BMC-91X",
        "filing_status_reason": "CANCEL",
        "ins_type_code": "1",
        "policy_no": "EBA 020 91 81",
        "ins_class_code": "P",
        "effective_date": "20130906",
        "max_cov_amount": "750000.00",
        "cancl_effective_date": "20260924",
        "insurance_company_name": "Example Insurer",
    }

    value = motus_past(row, TODAY)

    assert value is not None
    assert (value.status, value.termination_date) == ("CANCELLED", date(2026, 9, 24))
    assert value.coverage_amount == Decimal("750000.00")  # Motus: dollars
    assert (value.docket_prefix, value.docket_number) == (DocketPrefix.FF, "12038")


@pytest.mark.parametrize(
    ("prefix", "number", "key"),
    [
        (DocketPrefix.FF, "22", "FF000022"),
        (DocketPrefix.MC, "139446", "MC139446"),
        (DocketPrefix.MC, "1047172", "MC1047172"),
    ],
)
def test_legacy_docket_key(prefix: DocketPrefix, number: str, key: str) -> None:
    assert legacy_docket(prefix, number) == key


def test_policy_identity_ignores_spacing() -> None:
    a = motus_current(rows("c5y8-a4uz")[0], TODAY)
    assert a is not None and a.policy_number is not None
    spaced = motus_current(
        {**rows("c5y8-a4uz")[0], "policy_no": "  " + a.policy_number.replace(" ", "")}, TODAY
    )
    assert spaced is not None
    assert spaced.identity() == a.identity()
