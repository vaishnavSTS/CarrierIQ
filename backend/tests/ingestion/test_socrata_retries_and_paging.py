import httpx
import pytest

from app.core.exceptions import SourceFetchError
from tests.ingestion.helpers import socrata_client


def sequence(*responses: httpx.Response) -> list[httpx.Response]:
    return list(responses)


def test_server_error_is_retried_with_exponential_backoff() -> None:
    queue = sequence(
        httpx.Response(503, json={}),
        httpx.Response(500, json={}),
        httpx.Response(200, json=[{"a": "1"}]),
    )
    sleeps: list[float] = []

    rows = socrata_client(lambda _: queue.pop(0), sleeps).get_rows("ds", {})

    assert rows == [{"a": "1"}]
    assert sleeps == [1.0, 2.0]


def test_rate_limit_is_retried() -> None:
    queue = sequence(httpx.Response(429, json={}), httpx.Response(200, json=[]))
    sleeps: list[float] = []

    assert socrata_client(lambda _: queue.pop(0), sleeps).get_rows("ds", {}) == []
    assert sleeps == [1.0]


def test_network_error_is_retried() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ReadTimeout("slow", request=request)
        return httpx.Response(200, json=[])

    assert socrata_client(handler).get_rows("ds", {}) == []
    assert calls == 2


def test_client_error_is_not_retried() -> None:
    sleeps: list[float] = []

    with pytest.raises(SourceFetchError, match="HTTP 400"):
        socrata_client(lambda _: httpx.Response(400, json={}), sleeps).get_rows("ds", {})
    assert sleeps == []


def test_gives_up_after_the_last_attempt() -> None:
    sleeps: list[float] = []

    with pytest.raises(SourceFetchError, match="after 4 attempts"):
        socrata_client(lambda _: httpx.Response(502, json={}), sleeps).get_rows("ds", {})
    assert sleeps == [1.0, 2.0, 4.0]


def test_get_all_rows_pages_until_a_short_page() -> None:
    data = [{"id": str(n)} for n in range(5)]
    seen: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        seen.append(params)
        offset, limit = int(params["$offset"]), int(params["$limit"])
        return httpx.Response(200, json=data[offset : offset + limit])

    client = socrata_client(handler)
    client.page_size = 2

    rows = client.get_all_rows("ds", {"dot_number": "1"}, order="id")

    assert rows == data
    assert [p["$offset"] for p in seen] == ["0", "2", "4"]
    assert all(p["$order"] == "id" and p["dot_number"] == "1" for p in seen)
