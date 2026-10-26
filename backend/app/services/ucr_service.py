"""A carrier's Unified Carrier Registration (UCR), from FMCSA's public SAFER UCR query
(safer.fmcsa.dot.gov/UCRQuery.aspx?DOT_NUMBER=...), which lists each registration year and
whether its fee was paid. There is no official UCR API; this reads that page, so a change to its
layout shows as "could not check" rather than a wrong answer. Answers are cached for an hour.

UCR registration is by calendar year; next year's opens October 1 (ucr.gov).
"""

import html
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

import httpx

SAFER_UCR = "https://safer.fmcsa.dot.gov/UCRQuery.aspx"
CACHE_SECONDS = 3600
NEXT_YEAR_OPENS = (10, 1)  # month, day


@dataclass(frozen=True)
class UcrYear:
    year: int
    fee_paid: bool
    updated: date | None


@dataclass(frozen=True)
class UcrStatus:
    usdot_number: int
    years: list[UcrYear] = field(default_factory=list)
    checked_at: datetime | None = None
    error: str | None = None  # could not check (SAFER unreachable or changed)


def parse(page: str, usdot_number: int) -> list[UcrYear]:
    """Each "Registration Year: ..." block on the SAFER UCR page, newest first."""
    text = html.unescape(re.sub(r"<[^>]+>", " ", page))
    text = re.sub(r"\s+", " ", text)
    blocks = re.split(r"Registration Year:\s*", text)[1:]
    years: list[UcrYear] = []
    for block in blocks:
        year = re.match(r"(\d{4})", block)
        if not year:
            continue
        paid = re.search(r"Registration Fee Paid:\s*([YN])", block)
        updated = re.search(r"Registration Update Date:\s*(\d{4}-\d{2}-\d{2})", block)
        years.append(
            UcrYear(
                year=int(year.group(1)),
                fee_paid=bool(paid and paid.group(1) == "Y"),
                updated=date.fromisoformat(updated.group(1)) if updated else None,
            )
        )
    return sorted({y.year: y for y in years}.values(), key=lambda y: y.year, reverse=True)


def required_years(today: date) -> tuple[int, int | None]:
    """The year a carrier must be registered for now, and next year once its registration has
    opened (from October 1)."""
    opens = date(today.year, *NEXT_YEAR_OPENS)
    return today.year, (today.year + 1 if today >= opens else None)


class UcrService:
    def __init__(self, client: httpx.Client | None = None, timeout: float = 15.0) -> None:
        self.client = client
        self.timeout = timeout

    _cache: dict[int, tuple[float, UcrStatus]] = {}
    _lock = threading.Lock()

    def status(self, usdot_number: int) -> UcrStatus:
        now = time.monotonic()
        with self._lock:
            cached = self._cache.get(usdot_number)
            if cached and now - cached[0] < CACHE_SECONDS:
                return cached[1]
        result = self._fetch(usdot_number)
        if result.error is None:
            with self._lock:
                self._cache[usdot_number] = (now, result)
        return result

    def _fetch(self, usdot_number: int) -> UcrStatus:
        checked = datetime.now(UTC)
        try:
            client = self.client or httpx.Client(timeout=self.timeout, follow_redirects=True)
            try:
                response = client.get(SAFER_UCR, params={"DOT_NUMBER": usdot_number})
            finally:
                if self.client is None:
                    client.close()
        except httpx.HTTPError as exc:
            return UcrStatus(usdot_number, checked_at=checked, error=type(exc).__name__)
        if response.status_code != 200:
            return UcrStatus(usdot_number, checked_at=checked, error=f"HTTP {response.status_code}")
        page = response.text
        years = parse(page, usdot_number)
        if not years and "Registration Year" in page:
            return UcrStatus(usdot_number, checked_at=checked, error="Unexpected page layout")
        return UcrStatus(usdot_number, years=years, checked_at=checked)
