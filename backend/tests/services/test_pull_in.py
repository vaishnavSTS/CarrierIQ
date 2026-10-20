"""Weigh-station pull-in chance by state (pure lookups; the seed is read from migration 0023)."""

import importlib.util
from datetime import date
from pathlib import Path
from types import ModuleType

import pytest

from app.services.pull_in import RateRow, pull_in_for

MIGRATION = (
    Path(__file__).parents[2] / "alembic" / "versions" / "20261020_0023_iss_pull_in_rates.py"
)


def _migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migration_0023", MIGRATION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def rows() -> list[RateRow]:
    """The seeded table, as the repository returns it."""
    m = _migration()
    return [
        RateRow(state, low, high, percent, m.SOURCE, m.EFFECTIVE)
        for (low, high), percents in m.RATES.items()
        for state, percent in zip(m.STATES, percents, strict=True)
    ]


def rate(result: object, state: str) -> int | None:
    assert result is not None
    return next(r.percent for r in result.rates if r.state == state)  # type: ignore[attr-defined]


def test_seed_has_15_states_and_no_general_rate() -> None:
    m = _migration()
    assert len(m.STATES) == 15 and "GENERAL" not in m.STATES
    assert all(len(p) == 15 for p in m.RATES.values())
    assert list(m.RATES) == [
        (0, 49), (50, 59), (60, 64), (65, 69), (70, 74), (75, 79), (80, 88),
        (89, 89), (90, 90), (91, 91), (92, 92), (93, 93),
    ]  # fmt: skip


def test_band_edges(rows: list[RateRow]) -> None:
    low, high = pull_in_for(49, rows), pull_in_for(50, rows)
    assert low is not None and (low.band_min, low.band_max) == (0, 49)
    assert high is not None and (high.band_min, high.band_max) == (50, 59)
    assert rate(low, "PA") == 3 and rate(high, "PA") == 25
    single = pull_in_for(89, rows)
    assert single is not None and (single.band_min, single.band_max) == (89, 89)


def test_the_example_from_the_table(rows: list[RateRow]) -> None:
    result = pull_in_for(72, rows)
    assert rate(result, "CA") == 100 and rate(result, "PA") == 60 and rate(result, "IN") == 15
    assert rate(result, "MA") == 0


def test_above_the_table_uses_its_strictest_range(rows: list[RateRow]) -> None:
    at_top, above = pull_in_for(93, rows), pull_in_for(95, rows)
    assert at_top is not None and not at_top.beyond_table
    assert above is not None and above.beyond_table
    assert (above.band_min, above.band_max) == (93, 93) and rate(above, "WY") == 15


def test_no_score_or_no_table() -> None:
    assert pull_in_for(None, [RateRow("CA", 0, 49, 5, "s", date(2026, 10, 20))]) is None
    assert pull_in_for(70, []) is None


def test_highest_rate_first_and_no_rate_last(rows: list[RateRow]) -> None:
    result = pull_in_for(30, rows)
    assert result is not None
    percents = [r.percent for r in result.rates]
    assert percents[:3] == [5, 5, 5] and percents[-3:] == [None, None, None]
    assert {r.state for r in result.rates if r.percent is None} == {"SC", "UT", "WY"}
    known = [p for p in percents if p is not None]
    assert known == sorted(known, reverse=True)


def test_unlisted_states_have_no_rate_and_no_fallback(rows: list[RateRow]) -> None:
    result = pull_in_for(72, rows)
    assert result is not None
    assert len(result.rates) == 15
    assert "TX" not in {r.state for r in result.rates}
    assert "GENERAL" not in {r.state for r in result.rates}


def test_what_if_points_to_the_nearest_lower_range_that_helps(rows: list[RateRow]) -> None:
    result = pull_in_for(72, rows)
    assert result is not None and result.what_if is not None
    assert result.what_if.below == 70
    top = result.what_if.drops[0]
    assert (top.state, top.from_percent, top.to_percent) == ("CA", 100, 5)

    pa = pull_in_for(85, rows)
    assert pa is not None and pa.what_if is not None
    assert pa.what_if.below == 80
    assert (pa.what_if.drops[0].state, pa.what_if.drops[0].to_percent) == ("PA", 60)


def test_no_what_if_in_the_lowest_range(rows: list[RateRow]) -> None:
    result = pull_in_for(20, rows)
    assert result is not None and result.what_if is None
    assert result.source == "PrePass state pull-in rates (shared by STS)"
    assert result.effective_date == date(2026, 10, 20)


def test_the_safety_response_looks_up_the_estimated_iss_value() -> None:
    from types import SimpleNamespace
    from typing import Any, cast

    from app.schemas.carrier_safety import EstimatedIssOut
    from app.services.carrier_safety_service import CarrierSafetyService

    carrier = SimpleNamespace(id=1, usdot_number=123)
    refresh = SimpleNamespace(ensure_fresh=lambda _u: SimpleNamespace(carrier=carrier))
    inspections = SimpleNamespace(for_carrier=lambda _id: [])
    estimate = EstimatedIssOut(
        value=72,
        band="OPTIONAL",
        group=5,
        reason="r",
        basics=[],
        data_month=date(2026, 9, 1),
        version="v",
    )
    seen: list[int | None] = []

    def lookup(score: int | None) -> None:
        seen.append(score)

    service = CarrierSafetyService(
        cast(Any, refresh), cast(Any, inspections), iss=lambda _u: estimate, pull_in=lookup
    )
    service.safety(123)
    assert seen == [72]

    without = CarrierSafetyService(cast(Any, refresh), cast(Any, inspections), pull_in=lookup)
    without.safety(123)
    assert seen == [72, None]
