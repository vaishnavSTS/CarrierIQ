from typing import Any

import pytest

from app.core.exceptions import SourceFetchError, ValidationError
from app.ingestion.company_census import CompanyCensusAdapter
from tests.ingestion.helpers import load_census_rows, responding_with


def adapter_returning(body: Any) -> CompanyCensusAdapter:
    return CompanyCensusAdapter(responding_with(body))


def test_fetch_by_usdot_returns_the_row_exactly_as_received() -> None:
    rows = load_census_rows()

    row = adapter_returning(rows).fetch_by_usdot(295017)

    assert row == rows[0]
    assert row is not None
    assert row["legal_name"] == "UNITED MOVING AND STORAGE INC"


def test_unknown_usdot_returns_none() -> None:
    assert adapter_returning([]).fetch_by_usdot(999999999) is None


@pytest.mark.parametrize("bad", [0, -5, True, "295017", "1 OR 1=1", 2.5])
def test_only_positive_integers_reach_the_api(bad: Any) -> None:
    with pytest.raises(ValidationError):
        adapter_returning([]).fetch_by_usdot(bad)


def test_more_than_one_row_is_a_source_error() -> None:
    row = load_census_rows()[0]

    with pytest.raises(SourceFetchError, match="Expected one"):
        adapter_returning([row, row]).fetch_by_usdot(295017)


def test_row_for_a_different_usdot_is_a_source_error() -> None:
    with pytest.raises(SourceFetchError, match="when 123 was requested"):
        adapter_returning(load_census_rows()).fetch_by_usdot(123)
