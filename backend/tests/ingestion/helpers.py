"""Fake data.transportation.gov for ingestion tests. Tests never call the live API."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx

from app.ingestion.socrata_client import Row, SocrataClient

FIXTURES = Path(__file__).parent.parent / "fixtures"


def load_census_rows(name: str = "usdot_295017.json") -> list[Row]:
    """A real Company Census response saved from the live API."""
    rows: list[Row] = json.loads((FIXTURES / "company_census" / name).read_text())
    return rows


def load_inspection_rows() -> tuple[list[Row], list[Row]]:
    """Real inspection headers and their units for USDOT 295017, saved from the live API."""
    folder = FIXTURES / "inspections"
    headers: list[Row] = json.loads((folder / "headers_usdot_295017.json").read_text())
    units: list[Row] = json.loads((folder / "units_usdot_295017.json").read_text())
    return headers, units


def socrata_client(
    handler: Callable[[httpx.Request], httpx.Response],
    sleeps: list[float] | None = None,
) -> SocrataClient:
    """A client on a fake transport. Retry delays are recorded in `sleeps`, never slept."""
    http = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://socrata.test")
    recorded = sleeps if sleeps is not None else []
    return SocrataClient(http, sleep=recorded.append)


def responding_with(body: Any, status_code: int = 200) -> SocrataClient:
    return socrata_client(lambda _: httpx.Response(status_code, json=body))


def inspection_api(
    headers: list[Row], units: list[Row], *, fail_units: bool = False
) -> SocrataClient:
    """Fake API serving inspection headers and units, filtered like the real datasets."""

    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        if int(params.get("$offset", "0")) > 0:
            return httpx.Response(200, json=[])
        if request.url.path == "/resource/fx4q-ay7w.json":
            dot = params["dot_number"]
            return httpx.Response(200, json=[h for h in headers if h["dot_number"] == dot])
        if request.url.path == "/resource/wt8s-2hbx.json":
            if fail_units:
                return httpx.Response(400, json={"message": "bad query"})
            where = params["$where"]
            return httpx.Response(
                200, json=[u for u in units if f"'{u['inspection_id']}'" in where]
            )
        return httpx.Response(404, json={"message": "unknown dataset"})

    return socrata_client(handler)
