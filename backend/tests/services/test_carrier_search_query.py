import pytest

from app.core.exceptions import ValidationError
from app.models.enums import DocketPrefix
from app.services.carrier_search_query import SearchKind, SearchQuery, parse_search_query


@pytest.mark.parametrize(
    "text", ["295017", " 295017 ", "USDOT 295017", "dot#295017", "US DOT: 295017"]
)
def test_usdot(text: str) -> None:
    assert parse_search_query(text) == SearchQuery(SearchKind.USDOT, usdot_number=295017)


@pytest.mark.parametrize(
    ("text", "prefix", "number"),
    [
        ("MC139446", DocketPrefix.MC, "139446"),
        ("mc-139446", DocketPrefix.MC, "139446"),
        ("MC 0139446", DocketPrefix.MC, "139446"),  # leading zeros dropped, as in the census
        ("MX 123", DocketPrefix.MX, "123"),
        ("FF#4758", DocketPrefix.FF, "4758"),
    ],
)
def test_docket(text: str, prefix: DocketPrefix, number: str) -> None:
    assert parse_search_query(text) == SearchQuery(
        SearchKind.DOCKET, docket_prefix=prefix, docket_number=number
    )


@pytest.mark.parametrize(
    ("text", "name"),
    [
        ("united moving", "UNITED MOVING"),
        ("  Bob's   Trucking & Sons ", "BOB'S TRUCKING & SONS"),
        ("MC TRUCKING", "MC TRUCKING"),  # letters after MC: a name, not a docket
        ("123 trucking", "123 TRUCKING"),
        ("acme%_trucking", "ACME TRUCKING"),  # LIKE wildcards never reach the query
        ("x'); drop table carriers;--", "X' DROP TABLE CARRIERS --"),
    ],
)
def test_name(text: str, name: str) -> None:
    assert parse_search_query(text) == SearchQuery(SearchKind.NAME, name=name)


@pytest.mark.parametrize("text", ["0", "123456789", "MC0", "MC123456789", "ab", "%%", "   "])
def test_invalid_queries(text: str) -> None:
    with pytest.raises(ValidationError):
        parse_search_query(text)
