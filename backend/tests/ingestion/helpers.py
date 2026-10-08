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


def socrata_client(handler: Callable[[httpx.Request], httpx.Response]) -> SocrataClient:
    http = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://socrata.test")
    return SocrataClient(http)


def responding_with(body: Any, status_code: int = 200) -> SocrataClient:
    return socrata_client(lambda _: httpx.Response(status_code, json=body))
