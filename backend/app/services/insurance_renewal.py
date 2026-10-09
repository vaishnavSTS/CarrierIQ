"""Insurance renewal pattern, estimated from FMCSA filing history.

An FMCSA insurance filing (e.g. BMC-91X) has no end date: it stays on file until the insurer
cancels it. The policy behind it usually runs a year, but FMCSA only receives the start date. So
there is no official "due date"; what the records do show is when each filing started. When a
carrier's filings have started on about the same date every year, the next renewal is expected
around that date again. This is an estimate from the pattern, and is always worded as one.

Pure functions over stored filings.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from app.models import Insurance

YEAR_MIN, YEAR_MAX = 330, 400  # days between filings that count as a yearly renewal
MIN_YEARLY = 2  # yearly renewals in a row needed to call it a pattern
UPCOMING_DAYS = 30


@dataclass(frozen=True)
class Renewal:
    docket: str
    insurance_type: str
    current_effective: date
    since: date  # first filing of the yearly run
    filings: int  # filings in the yearly run, including the current one
    expected: date  # the next renewal, if the pattern holds
    data_as_of: date | None  # how current the source data is
    source_system: str | None
    # pattern (later than 30 days) | upcoming (within 30 days) | unconfirmed (expected date passed
    # after the data stopped updating) | passed (expected date passed; filing still on file)
    state: str


def _plus_year(day: date) -> date:
    try:
        return day.replace(year=day.year + 1)
    except ValueError:  # 29 February
        return day.replace(year=day.year + 1, day=28)


def renewals(filings: Sequence[Insurance], today: date) -> list[Renewal]:
    groups: dict[tuple[str, str], list[Insurance]] = defaultdict(list)
    for f in filings:
        if f.docket_prefix and f.docket_number and f.insurance_type and f.effective_date:
            groups[(f"{f.docket_prefix.value}{f.docket_number}", f.insurance_type)].append(f)

    found = []
    for (docket, kind), group in sorted(groups.items()):
        on_file = [f for f in group if f.on_file and f.effective_date]
        if not on_file:
            continue
        current = max(on_file, key=lambda f: f.effective_date or date.min)
        assert current.effective_date is not None
        starts = sorted(
            {
                f.effective_date
                for f in group
                if f.effective_date and f.effective_date <= current.effective_date
            }
        )
        # Walk back from the current filing while each step is about one year.
        run = [starts[-1]]
        for earlier in reversed(starts[:-1]):
            if YEAR_MIN <= (run[0] - earlier).days <= YEAR_MAX:
                run.insert(0, earlier)
            else:
                break
        if len(run) - 1 < MIN_YEARLY:
            continue
        expected = _plus_year(current.effective_date)
        as_of = current.status_as_of
        if expected > today:
            state = "upcoming" if expected <= today + timedelta(days=UPCOMING_DAYS) else "pattern"
        elif as_of is not None and as_of < expected:
            state = "unconfirmed"
        else:
            state = "passed"
        found.append(
            Renewal(
                docket=docket,
                insurance_type=kind,
                current_effective=current.effective_date,
                since=run[0],
                filings=len(run),
                expected=expected,
                data_as_of=as_of,
                source_system=current.source_system,
                state=state,
            )
        )
    return found


def describe(r: Renewal) -> str:
    """One plain sentence, attributed to FMCSA's filing history, for the UI."""
    month_day = f"{r.current_effective:%B} {r.current_effective.day}"
    basis = (
        f"FMCSA filings for {r.docket} have started around {month_day} each year since "
        f"{r.since.year} ({r.filings} filings). FMCSA records only start dates, so this is an "
        "estimate from that pattern."
    )
    if r.state == "unconfirmed":
        stopped = r.data_as_of.isoformat() if r.data_as_of else "unknown"
        return (
            f"{basis} The next renewal was expected around {r.expected.isoformat()}, after the "
            f"source data stopped updating ({stopped}), so whether it was filed cannot be "
            "confirmed from public data. A current "
            "certificate of insurance from the carrier or its insurer would show it."
        )
    if r.state == "passed":
        return (
            f"{basis} The expected renewal around {r.expected.isoformat()} has passed and the "
            "filing is still on file; insurers that renew with the same carrier often keep the "
            "same filing."
        )
    if r.state == "upcoming":
        return f"{basis} The next renewal is expected around {r.expected.isoformat()}."
    return f"{basis} Next expected around {r.expected.isoformat()}."
