"""Weigh-station pull-in chance by state for a carrier's Estimated ISS. Pure functions.

FMCSA gives each carrier one ISS score, the same everywhere; each state decides how often a
PrePass-equipped truck with a score in a given range is pulled in for inspection. The rates live
in the iss_pull_in_rates table (seeded from the PrePass table STS shares with customers). This
finds the range the score falls in and returns that row: one rate per state, highest first.
Scores above the table's last range get its strictest (last) rates, flagged beyond_table.
States with no row have no rate on file: there is no general fallback.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.schemas.carrier_safety import PullInDropOut, PullInOut, PullInRateOut, PullInWhatIfOut


@dataclass(frozen=True)
class RateRow:
    state: str
    min_score: int
    max_score: int
    percent: int | None
    source: str
    effective_date: date


Band = tuple[int, int]


def _bands(rows: Sequence[RateRow]) -> dict[Band, dict[str, int | None]]:
    """{(min, max): {state: percent}}, lowest range first."""
    bands: dict[Band, dict[str, int | None]] = {}
    for row in sorted(rows, key=lambda r: r.min_score):
        bands.setdefault((row.min_score, row.max_score), {})[row.state] = row.percent
    return bands


def _what_if(bands: dict[Band, dict[str, int | None]], band: Band) -> PullInWhatIfOut | None:
    """The nearest lower range where any state's rate falls, and the falls there."""
    current = bands[band]
    for lower in sorted((b for b in bands if b[1] < band[0]), reverse=True):
        drops = [
            PullInDropOut(state=state, from_percent=now, to_percent=then)
            for state, now in current.items()
            if now is not None and (then := bands[lower].get(state)) is not None and then < now
        ]
        if drops:
            drops.sort(key=lambda d: (d.to_percent - d.from_percent, d.state))
            return PullInWhatIfOut(below=lower[1] + 1, drops=drops)
    return None


def pull_in_for(score: int | None, rows: Sequence[RateRow]) -> PullInOut | None:
    """Each state's pull-in rate for this Estimated ISS; None without a score or a table."""
    if score is None or not rows:
        return None
    bands = _bands(rows)
    found = next(((low, high) for low, high in bands if low <= score <= high), None)
    top = max(bands, key=lambda b: b[1])
    beyond = found is None and score > top[1]
    band = top if beyond else found
    if band is None:  # a gap in the table, or a score below its first range
        return None
    by_state = bands[band]
    rates = sorted(
        (PullInRateOut(state=s, percent=p) for s, p in by_state.items()),
        key=lambda r: (r.percent is None, -(r.percent or 0), r.state),
    )
    first = next(r for r in rows if (r.min_score, r.max_score) == band)
    return PullInOut(
        score=score,
        band_min=band[0],
        band_max=band[1],
        beyond_table=beyond,
        rates=rates,
        what_if=_what_if(bands, band),
        source=first.source,
        effective_date=first.effective_date,
    )
