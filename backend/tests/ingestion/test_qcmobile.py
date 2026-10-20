"""FMCSA QCMobile client: EIN normalization, response parsing and keeping the WebKey secret.

Uses a synthetic response and a made-up key and EIN; no network.
"""

import logging

import httpx
import pytest

from app.core.exceptions import SourceFetchError
from app.ingestion.qcmobile import (
    QcMobileClient,
    RedactWebKeyFilter,
    carrier_of,
    normalize_ein,
    redact,
)

KEY = "test-web-key-0123456789"


def body(ein: object = 123456789, dot: int = 1234567) -> dict[str, object]:
    return {
        "content": {
            "carrier": {"dotNumber": dot, "legalName": "TEST FREIGHT LLC", "ein": ein},
            "_links": {"basics": {"href": f"https://qc.test/carriers/{dot}/basics?webKey={KEY}"}},
        },
        "retrievalDate": "2026-10-20T12:00:00.000+0000",
    }


def client(status: int = 200, payload: object | None = None, seen: list[str] | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(str(request.url))
        if status != 200:
            return httpx.Response(status, text=f"error for {request.url}")
        return httpx.Response(200, json=payload if payload is not None else body())

    http = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://qc.test")
    return QcMobileClient(http, web_key=KEY, sleep=lambda _: None)


# --- EIN ---


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (123456789, "123456789"),
        ("12-3456789", "123456789"),
        (12345678, "012345678"),  # a number drops the leading zero
        (0, None),
        ("", None),
        (None, None),
        (True, None),
        ("1234567890", None),
    ],
)
def test_normalize_ein(value: object, expected: str | None) -> None:
    assert normalize_ein(value) == expected


# --- parsing ---


def test_fetch_carrier_returns_the_snapshot_without_the_key() -> None:
    seen: list[str] = []
    row = client(seen=seen).fetch_carrier(1234567)
    assert row is not None
    assert normalize_ein(row["ein"]) == "123456789"
    assert seen == [f"https://qc.test/carriers/1234567?webKey={KEY}"]
    assert KEY not in str(row)  # an echoed link is scrubbed before storing


def test_unknown_carrier_is_none() -> None:
    assert carrier_of({"content": None}) is None
    assert carrier_of({"content": {"carrier": None}}) is None


def test_unexpected_body_raises() -> None:
    with pytest.raises(SourceFetchError):
        carrier_of(["not", "a", "dict"])


def test_failure_message_never_contains_the_key() -> None:
    with pytest.raises(SourceFetchError) as caught:
        client(status=403).fetch_carrier(1234567)
    assert KEY not in caught.value.message
    assert "[redacted]" in caught.value.message


def test_without_a_key_nothing_is_requested() -> None:
    seen: list[str] = []
    unconfigured = client(seen=seen)
    unconfigured.web_key = None
    assert not unconfigured.enabled
    with pytest.raises(SourceFetchError):
        unconfigured.fetch_carrier(1234567)
    assert seen == []


def test_fetch_many_reports_failures() -> None:
    found, failed = client(status=500).fetch_many([1, 2])
    assert found == {}
    assert sorted(failed) == [1, 2]


# --- logging ---


def test_redact() -> None:
    assert redact(f"GET https://qc.test/carriers/1?webKey={KEY}&x=1") == (
        "GET https://qc.test/carriers/1?webKey=[redacted]&x=1"
    )


def test_request_log_lines_never_show_the_key(caplog: pytest.LogCaptureFixture) -> None:
    """httpx logs each request URL at INFO; the filter blanks the WebKey."""
    record = logging.LogRecord(
        "httpx",
        logging.INFO,
        __file__,
        1,
        'HTTP Request: %s %s "%s %d %s"',
        ("GET", f"https://qc.test/carriers/1?webKey={KEY}", "HTTP/1.1", 200, "OK"),
        None,
    )
    assert RedactWebKeyFilter().filter(record)
    assert KEY not in record.getMessage()

    with caplog.at_level(logging.INFO, logger="httpx"):
        client().fetch_carrier(1234567)
    assert caplog.records, "httpx should have logged the request"
    assert all(KEY not in r.getMessage() for r in caplog.records)
