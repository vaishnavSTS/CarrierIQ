"""Insurance renewal pattern from FMCSA filing start dates (pure)."""

from datetime import date

from app.models import Insurance
from app.models.enums import DocketPrefix
from app.services.insurance_renewal import describe, renewals
from app.services.registration_health import registration_checks
from tests.services.test_network import carrier

FROZEN = date(2026, 5, 14)


def filing(
    start: date, end: date | None, *, as_of: date = FROZEN, source: str = "LEGACY_LI"
) -> Insurance:
    return Insurance(
        docket_prefix=DocketPrefix.MC,
        docket_number="207446",
        insurance_type="BIPD",
        effective_date=start,
        termination_date=end,
        on_file=end is None,
        status_as_of=as_of,
        source_system=source,
    )


def vanek(**current: object) -> list[Insurance]:
    """Vanek Brothers' real pattern: a new filing every June 18 since 2021."""
    years = [2021, 2022, 2023, 2024]
    past = [filing(date(y, 6, 18), date(y + 1, 6, 18)) for y in years]
    return [*past, filing(date(2025, 6, 18), None, **current)]  # type: ignore[arg-type]


def test_yearly_pattern_after_data_stopped_is_unconfirmed() -> None:
    (r,) = renewals(vanek(), today=date(2026, 10, 9))

    assert (r.since, r.filings, r.expected) == (date(2021, 6, 18), 5, date(2026, 6, 18))
    assert r.state == "unconfirmed"  # expected Jun 18, data stopped May 14
    text = describe(r)
    assert "around June 18 each year since 2021 (5 filings)" in text
    assert "FMCSA records only start dates, so this is an estimate" in text
    assert "cannot be confirmed from public data" in text


def test_upcoming_and_future_renewals() -> None:
    assert renewals(vanek(), today=date(2026, 6, 1))[0].state == "upcoming"
    assert renewals(vanek(), today=date(2026, 1, 10))[0].state == "pattern"


def test_current_data_past_the_expected_date() -> None:
    current = vanek(as_of=date(2026, 10, 1), source="MOTUS")

    (r,) = renewals(current, today=date(2026, 10, 9))

    assert r.state == "passed"
    assert "often keep the same filing" in describe(r)


def test_no_pattern_without_two_yearly_renewals() -> None:
    irregular = [
        filing(date(2020, 3, 1), date(2022, 9, 1)),
        filing(date(2022, 9, 1), date(2023, 2, 1)),
        filing(date(2023, 2, 1), None),
    ]
    assert renewals(irregular, today=date(2026, 10, 9)) == []


def test_unconfirmed_renewal_is_a_registration_check() -> None:
    found = registration_checks(
        carrier=carrier(last_mcs150_date=date(2026, 1, 15)),
        census={},
        authorities=[],
        addresses=[],
        oos_orders=[],
        revocations=[],
        legacy_frozen_on=FROZEN,
        today=date(2026, 10, 9),
        insurance=vanek(),
    )

    check = next(c for c in found if c.key == "renewal_bipd")
    assert check.label == "Insurance renewal (liability (BI&PD), MC207446)"
    assert (check.status, check.as_of) == ("attention", date(2026, 6, 18))
