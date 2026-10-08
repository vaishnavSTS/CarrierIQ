"""Headline insurance status (no database)."""

from datetime import date

from app.models import Authority, Insurance
from app.models.enums import DocketPrefix
from app.services.insurance_status import insurance_status

MC = DocketPrefix.MC


def docket(
    number: str, status: str, source: str = "MOTUS", kind: str = "Motor Carrier of Property"
) -> Authority:
    return Authority(
        docket_prefix=MC,
        docket_number=number,
        status=status,
        status_source=source,
        authority_type=kind,
    )


def filing(number: str, kind: str = "BIPD", source: str = "MOTUS") -> Insurance:
    return Insurance(
        docket_prefix=MC,
        docket_number=number,
        insurance_type=kind,
        on_file=True,
        source_system=source,
        status_as_of=date(2026, 10, 8),
    )


def test_on_file_when_every_active_docket_has_bipd() -> None:
    result = insurance_status([docket("1", "ACTIVE"), docket("2", "INACTIVE")], [filing("1")])

    assert (result.status, result.source_system, result.as_of) == (
        "ON_FILE",
        "MOTUS",
        date(2026, 10, 8),
    )


def test_not_on_file_when_an_active_docket_has_none() -> None:
    result = insurance_status(
        [docket("1", "ACTIVE"), docket("2", "ACTIVE")], [filing("1"), filing("2", kind="CARGO")]
    )

    assert result.status == "NOT_ON_FILE"


def test_broker_bond_counts() -> None:
    broker = docket("3", "ACTIVE", kind="Broker of Property (Except Household Goods)")

    assert insurance_status([broker], [filing("3", kind="BOND")]).status == "ON_FILE"


def test_no_active_authority_means_no_claim() -> None:
    assert insurance_status([docket("1", "INACTIVE")], []).status is None
    # A census docket status is not an operating-authority status.
    assert insurance_status([docket("1", "ACTIVE", source="CENSUS")], []).status is None


def test_mixed_sources() -> None:
    result = insurance_status(
        [docket("1", "ACTIVE"), docket("2", "ACTIVE", source="LEGACY_LI")],
        [filing("1"), filing("2", source="LEGACY_LI")],
    )

    assert result.source_system == "MIXED"
