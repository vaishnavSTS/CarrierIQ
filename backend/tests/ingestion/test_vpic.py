"""NHTSA vPIC client and decode normalizer, using a real vPIC response."""

import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest

from app.core.exceptions import SourceFetchError
from app.ingestion.vpic import VpicClient
from app.ingestion.vpic_normalizer import decoded_vehicle

FIXTURE = Path(__file__).parent.parent / "fixtures" / "vpic" / "decode_usdot_295017.json"


def real_results() -> dict[str, dict[str, Any]]:
    return {r["VIN"]: r for r in json.loads(FIXTURE.read_text(encoding="utf-8"))}


def fake_vpic(calls: list[list[str]] | None = None, status: int = 200) -> VpicClient:
    """Answers each batch from the saved real results (unknown VINs: empty decode)."""
    known = real_results()
    recorded = calls if calls is not None else []

    def handler(request: httpx.Request) -> httpx.Response:
        vins = parse_qs(request.content.decode())["data"][0].split(";")
        recorded.append(vins)
        if status != 200:
            return httpx.Response(status, text="unavailable")
        rows = [
            known.get(v, {"VIN": v, "Make": "", "ErrorCode": "11", "ErrorText": "11 - Unknown"})
            for v in vins
        ]
        return httpx.Response(200, json={"Count": len(rows), "Results": rows})

    http = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://vpic.test")
    return VpicClient(http, sleep=lambda _: None)


# --- normalizer ---


def test_clean_decode() -> None:
    value = decoded_vehicle(real_results()["1FUBCXBS9DHFG2386"])

    assert value is not None
    assert (value.decoded_make, value.decoded_model, value.decoded_year) == (
        "FREIGHTLINER",
        "M2",
        2013,
    )
    assert (value.decoded_body_class, value.decoded_vehicle_type) == ("Truck-Tractor", "TRUCK")
    assert value.decoded_gvwr is not None and value.decoded_gvwr.startswith("Class 7")
    assert (value.decode_error_code, value.check_digit_valid) == ("0", True)


def test_wrong_check_digit_still_decodes_but_is_flagged() -> None:
    value = decoded_vehicle(real_results()["1FUBCXBS9DHFG2387"])

    assert value is not None
    assert value.decoded_make == "FREIGHTLINER"
    assert (value.decode_error_code, value.check_digit_valid) == ("1", False)


def test_several_codes_and_blank_values() -> None:
    value = decoded_vehicle(
        {"VIN": "zzzzzzzzzzzzzzzzz", "Make": "", "ModelYear": "", "ErrorCode": "1, 7,11,400"}
    )

    assert value is not None
    assert value.vin == "ZZZZZZZZZZZZZZZZZ"
    assert (value.decoded_make, value.decoded_year) == (None, None)  # vPIC "" means unknown
    assert (value.decode_error_code, value.check_digit_valid) == ("1,7,11,400", False)


def test_trailer_decode() -> None:
    value = decoded_vehicle(real_results()["4P5T82224D1195316"])

    assert value is not None
    assert value.decoded_vehicle_type == "TRAILER"


# --- client ---


def test_decodes_in_batches_of_50() -> None:
    calls: list[list[str]] = []
    vins = [f"1FUBCXBS9DHFG{n:04d}" for n in range(120)]

    results = fake_vpic(calls).decode(vins)

    assert sorted(len(c) for c in calls) == [20, 50, 50]  # batches run in parallel
    assert len(results) == 120


def test_outage_is_retried_then_reported() -> None:
    calls: list[list[str]] = []

    with pytest.raises(SourceFetchError, match="NHTSA vPIC"):
        fake_vpic(calls, status=503).decode(["1FUBCXBS9DHFG2386"])
    assert len(calls) == 4  # retried with backoff, then gave up


@pytest.mark.parametrize("bad", ["1fubcxbs9dhfg2386", "1FUB'; DROP", "1FUBCXBS9DHFG23861"])
def test_unsafe_vins_never_reach_vpic(bad: str) -> None:
    calls: list[list[str]] = []

    with pytest.raises(SourceFetchError, match="Invalid VIN"):
        fake_vpic(calls).decode([bad])
    assert calls == []
