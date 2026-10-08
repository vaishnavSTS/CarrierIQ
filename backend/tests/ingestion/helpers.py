"""Fake data.transportation.gov for ingestion tests. Tests never call the live API."""

import json
import re
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


class FakeDotApi:
    """Fake data.transportation.gov: census (by USDOT, docket, name), inspections and units.

    `calls` counts requests per dataset. Set `down = True` to answer every request with HTTP 400,
    or add dataset IDs to `failing` to fail only those.
    """

    def __init__(
        self,
        census: list[Row],
        headers: list[Row] | None = None,
        units: list[Row] | None = None,
    ) -> None:
        self.census = census
        self.headers = headers or []
        self.units = units or []
        self.calls: dict[str, int] = {}
        self.down = False
        self.failing: set[str] = set()

    def client(self) -> SocrataClient:
        return socrata_client(self._handle)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        dataset = request.url.path.removeprefix("/resource/").removesuffix(".json")
        self.calls[dataset] = self.calls.get(dataset, 0) + 1
        if self.down or dataset in self.failing:
            return httpx.Response(400, json={"message": "source unavailable"})
        params = request.url.params
        if int(params.get("$offset", "0")) > 0:
            return httpx.Response(200, json=[])
        where = params.get("$where", "")
        if dataset == "az4n-8mr2":
            return httpx.Response(200, json=self._census(params, where))
        if dataset == "fx4q-ay7w":
            dot = params["dot_number"]
            return httpx.Response(200, json=[h for h in self.headers if h["dot_number"] == dot])
        if dataset == "wt8s-2hbx":
            return httpx.Response(
                200, json=[u for u in self.units if f"'{u['inspection_id']}'" in where]
            )
        return httpx.Response(404, json={"message": "unknown dataset"})

    def _census(self, params: httpx.QueryParams, where: str) -> list[Row]:
        if "dot_number" in params:
            return [r for r in self.census if r["dot_number"] == params["dot_number"]]
        if "docket1prefix" in where:
            prefix, number = re.findall(r"docket1prefix='(\w+)' AND docket1='(\d+)'", where)[0]
            matches = [
                r
                for r in self.census
                if any(
                    r.get(f"docket{n}prefix") == prefix and r.get(f"docket{n}") == number
                    for n in (1, 2, 3)
                )
            ]
            return [{"dot_number": r["dot_number"]} for r in matches]
        names = lambda r: (r.get("legal_name", "").upper(), r.get("dba_name", "").upper())  # noqa: E731
        if "starts_with" in where:
            text = re.findall(r"starts_with\(upper\(legal_name\), '(.*?)'\)", where)[0]
            text = text.replace("''", "'")
            return [r for r in self.census if any(n.startswith(text) for n in names(r))]
        if " like " in where:
            text = re.findall(r"like '%(.*?)%'", where)[0].replace("''", "'")
            return [r for r in self.census if any(text in n for n in names(r))]
        return []
