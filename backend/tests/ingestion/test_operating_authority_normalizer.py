"""Operating-authority rows (Motus and legacy L&I) -> canonical values, using real rows."""

from datetime import date
from decimal import Decimal
from typing import Any

import pytest

from app.ingestion.operating_authority_normalizer import (
    legacy_current,
    legacy_events,
    merge_motus,
    motus_current,
    motus_events,
    parse_docket,
)
from app.models.enums import DocketPrefix
from tests.ingestion.helpers import load_authority_rows

FROZEN = date(2026, 5, 14)
TODAY = date(2026, 10, 8)


def rows(dataset_id: str) -> list[dict[str, Any]]:
    return load_authority_rows()[dataset_id]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("MC139446", (DocketPrefix.MC, "139446")),
        ("MC0000139446", (DocketPrefix.MC, "139446")),  # Motus-style zero padding
        ("ff4758", (DocketPrefix.FF, "4758")),
        ("XX123", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_docket(value: str | None, expected: tuple[DocketPrefix, str] | None) -> None:
    assert parse_docket(value) == expected


def test_motus_current() -> None:
    values = motus_current(rows("inys-ebih")[0], TODAY)

    assert values is not None
    assert (values.docket_prefix, values.docket_number) == (DocketPrefix.MC, "139446")
    assert values.authority_type == "Motor Carrier of Household Goods"
    assert (values.status, values.status_source, values.status_as_of) == ("ACTIVE", "MOTUS", TODAY)
    assert (values.cargo_required, values.cargo_on_file) == (True, True)
    assert (values.bond_required, values.bond_on_file) == (False, False)


def test_legacy_current() -> None:
    values = legacy_current(rows("6eyk-hxee")[0], FROZEN)

    assert values is not None
    assert values.authority_type == "Common carrier (Household goods)"
    assert (values.status, values.status_source, values.status_as_of) == (
        "ACTIVE",
        "LEGACY_LI",
        FROZEN,
    )
    assert values.revocation_pending is False


def test_both_systems_give_the_same_dollar_amounts() -> None:
    """Legacy amounts are in thousands, Motus amounts in dollars (despite the dictionary)."""
    motus = motus_current(rows("inys-ebih")[0], TODAY)
    legacy = legacy_current(rows("6eyk-hxee")[0], FROZEN)

    assert motus is not None and legacy is not None
    assert motus.bipd_required == legacy.bipd_required == Decimal("750000.00")
    assert motus.bipd_on_file == legacy.bipd_on_file == Decimal("1000000.00")


@pytest.mark.parametrize(
    ("overrides", "status"),
    [
        ({"common_stat": "I"}, "INACTIVE"),
        ({"common_stat": "N", "broker_stat": "A"}, "ACTIVE"),
        ({"common_stat": "N", "contract_app_pend": "Y"}, "PENDING"),
        ({"common_stat": "N"}, None),
    ],
)
def test_legacy_status(overrides: dict[str, str], status: str | None) -> None:
    values = legacy_current({**rows("6eyk-hxee")[0], **overrides}, FROZEN)

    assert values is not None
    assert values.status == status


def test_legacy_revocation_pending() -> None:
    values = legacy_current({**rows("6eyk-hxee")[0], "common_rev_pend": "Y"}, FROZEN)

    assert values is not None
    assert values.revocation_pending is True


def test_legacy_kinds_give_common_contract_and_broker_each_its_status() -> None:
    # e.g. STINGRAY EXPRESS INC (MC787470): contract authority only.
    row = {
        **rows("6eyk-hxee")[0],
        "common_stat": "N",
        "contract_stat": "A",
        "broker_stat": "N",
        "broker_app_pend": "Y",
        "contract_rev_pend": "Y",
    }
    values = legacy_current(row, FROZEN)

    assert values is not None
    assert [(k.kind, k.status) for k in values.kinds] == [
        ("Common carrier", "NONE"),
        ("Contract carrier", "ACTIVE"),
        ("Broker", "PENDING"),  # applied for, not granted yet
    ]
    contract = values.kinds[1]
    assert contract.revocation_pending is True


def test_motus_kind_is_its_authority_type() -> None:
    values = motus_current(rows("inys-ebih")[0], TODAY)

    assert values is not None
    assert [(k.kind, k.status) for k in values.kinds] == [
        ("Motor Carrier of Household Goods", "ACTIVE")
    ]


def test_motus_rows_for_one_docket_are_merged() -> None:
    """Motus lists each authority type under a docket as its own row; none may be lost."""
    base = rows("inys-ebih")[0]
    carrier = motus_current({**base, "op_auth_type": "Motor Carrier of Property"}, TODAY)
    broker = motus_current(
        {
            **base,
            "op_auth_type": "Broker of Property",
            "op_auth_status": "Inactive",
            "min_cov_amount": "0",
            "bipd_file": "0",
        },
        TODAY,
    )
    assert carrier is not None and broker is not None

    merged = merge_motus([broker, carrier])

    assert merged.status == "ACTIVE"  # active if any kind is active
    assert merged.authority_type == "Broker of Property · Motor Carrier of Property"
    assert [(k.kind, k.status) for k in merged.kinds] == [
        ("Broker of Property", "INACTIVE"),
        ("Motor Carrier of Property", "ACTIVE"),
    ]
    assert merged.bipd_required == Decimal("750000.00")  # the carrier row's, not the broker's 0
    assert merge_motus([carrier]) == carrier


def test_legacy_history_has_original_and_disposition_actions() -> None:
    events = [e for row in rows("9mw4-x3tu") for e in legacy_events(row)]

    assert sorted((e.action_date, e.action, e.event_kind) for e in events) == [
        (date(1986, 7, 18), "GRANTED", "ORIGINAL"),
        (date(2005, 11, 7), "INVOLUNTARY REVOCATION", "ORIGINAL"),
        (date(2005, 11, 29), "DISCONTINUED REVOCATION", "DISPOSITION"),
        (date(2021, 6, 8), "REVOKED", "DISPOSITION"),
        (date(2021, 6, 15), "REINSTATED", "ORIGINAL"),
    ]
    assert all(e.source_system == "LEGACY_LI" for e in events)


def test_motus_history() -> None:
    (event,) = motus_events(rows("yu5v-wbh6")[0])

    assert (event.action, event.status, event.reason, event.action_date) == (
        "REINSTATED",
        "ACTIVE",
        "REINSTATED",
        date(2021, 6, 15),
    )
    assert (event.event_kind, event.source_system) == ("STATUS", "MOTUS")


def test_rows_without_a_usable_docket_are_skipped() -> None:
    row = {**rows("inys-ebih")[0], "docket_number": "??"}

    assert motus_current(row, TODAY) is None
    assert motus_events(row) == []
