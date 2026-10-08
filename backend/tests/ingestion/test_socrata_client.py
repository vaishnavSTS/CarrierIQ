import httpx
import pytest

from app.core.exceptions import SourceFetchError
from tests.ingestion.helpers import load_census_rows, responding_with, socrata_client


def test_returns_rows_and_sends_filters() -> None:
    rows = load_census_rows()
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=rows)

    result = socrata_client(handler).get_rows("az4n-8mr2", {"dot_number": "295017"})

    assert result == rows
    assert seen[0].url.path == "/resource/az4n-8mr2.json"
    assert seen[0].url.params["dot_number"] == "295017"


def test_http_error_status_raises_source_fetch_error() -> None:
    client = responding_with({"message": "server error"}, status_code=500)

    with pytest.raises(SourceFetchError, match="HTTP 500"):
        client.get_rows("az4n-8mr2", {})


def test_network_failure_raises_source_fetch_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    with pytest.raises(SourceFetchError, match="failed"):
        socrata_client(handler).get_rows("az4n-8mr2", {})


def test_unexpected_response_shape_raises_source_fetch_error() -> None:
    with pytest.raises(SourceFetchError, match="unexpected response shape"):
        responding_with({"rows": []}).get_rows("az4n-8mr2", {})


def test_invalid_json_raises_source_fetch_error() -> None:
    client = socrata_client(lambda _: httpx.Response(200, text="<html>maintenance</html>"))

    with pytest.raises(SourceFetchError, match="invalid JSON"):
        client.get_rows("az4n-8mr2", {})
