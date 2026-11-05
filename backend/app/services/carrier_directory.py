"""The carrier directory: interstate carriers by state, active or inactive, from FMCSA's Company
Census File.

Reads data.transportation.gov live (settings.census_dataset_id) with fixed SoQL: the state comes
from STATES, the letter is one A-Z character and a county three digits, so nothing a visitor types
reaches a query as text. State and county totals change slowly, so they are kept in memory for
STATE_COUNTS_TTL.

Only what tells carriers apart is returned (name, city, county code, USDOT, fleet, drivers,
registration date): never phones, emails or officers.

Interstate = census carrier_operation 'A'; active = status_code 'A', inactive = status_code 'I'
(the census has no date for when a USDOT went inactive). Fleet sizes are what the
carrier reported on its MCS-150; a USDOT under REPORTED_FLEET_CHECK_YEARS old reporting
REPORTED_FLEET_CHECK_UNITS or more power units is marked for a closer look, the pattern the
booking check also treats as a fraud sign.
"""

import threading
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from app.core.config import get_settings
from app.ingestion.socrata_client import SocrataClient

# The 50 states and DC, as the census writes them (phy_state).
STATES: dict[str, str] = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin",
    "WY": "Wyoming",
}  # fmt: skip

Status = Literal["active", "inactive"]
INTERSTATE: dict[str, str] = {
    "active": "status_code='A' AND carrier_operation='A'",
    "inactive": "status_code='I' AND carrier_operation='A'",
}
STATE_COUNTS_TTL = 6 * 3600.0
RECENT_TTL = 3600.0
RECENT_LIMIT = 60  # two strips of 30 on the pages
NEW_DAYS = 30
PAGE_SIZE = 25
REPORTED_FLEET_CHECK_UNITS = 1000
REPORTED_FLEET_CHECK_YEARS = 5

# "new": registered in the last NEW_DAYS days; "rated": a Satisfactory safety rating, newest
# rating first (the portals' map only).
Sort = Literal["newest", "largest", "az", "new", "rated"]


@dataclass(frozen=True)
class StateCount:
    state: str
    name: str
    carriers: int
    new_last_30_days: int


@dataclass(frozen=True)
class CountyCount:
    county: str  # the census's 3-digit county code (FIPS); with the state's, the map's county
    carriers: int
    new_last_30_days: int


@dataclass(frozen=True)
class DirectoryCarrier:
    usdot_number: int
    legal_name: str
    dba_name: str | None
    city: str | None
    county_code: str | None
    power_units: int | None
    drivers: int | None
    registered_on: date | None
    fleet_needs_check: bool
    rated_on: date | None = None  # its Satisfactory rating, in the "rated" list


@dataclass(frozen=True)
class RecentCarrier:
    usdot_number: int
    legal_name: str
    city: str | None
    state: str
    registered_on: date | None


@dataclass(frozen=True)
class StatePage:
    state: str
    name: str
    sort: Sort
    letter: str | None
    page: int
    carriers: list[DirectoryCarrier]
    has_more: bool
    county: str | None = None


def is_county_code(value: object) -> bool:
    """A county code as the census writes it: three digits (so it is safe in a query)."""
    return isinstance(value, str) and len(value) == 3 and value.isdigit()


def _int(value: object) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def _day(value: object) -> date | None:
    text = str(value or "")
    try:
        return datetime.strptime(text[:8], "%Y%m%d").date()
    except ValueError:
        return None


class CarrierDirectory:
    def __init__(self, client: SocrataClient, *, now=time.monotonic, today=None) -> None:
        self.client = client
        self.dataset = get_settings().census_dataset_id
        self._now = now
        self._today = today or (lambda: datetime.now(UTC).date())

    # --- State totals -------------------------------------------------------------------------

    def state_counts(self, status: Status = "active") -> list[StateCount]:
        key = f"states:{status}"
        with _CACHE_LOCK:
            cached = _CACHE.get(key)
            if cached and self._now() - cached[0] < STATE_COUNTS_TTL:
                return cached[1]
        since = (self._today() - timedelta(days=NEW_DAYS)).strftime("%Y%m%d")
        base = INTERSTATE[status]
        totals = self._grouped(base)
        new = self._grouped(f"{base} AND add_date >= '{since}'")
        counts = [
            StateCount(code, name, totals.get(code, 0), new.get(code, 0))
            for code, name in STATES.items()
        ]
        with _CACHE_LOCK:
            _CACHE[key] = (self._now(), counts)
        return counts

    # --- One state's counties -------------------------------------------------------------------

    def county_counts(self, state: str, status: Status = "active") -> list[CountyCount]:
        """A state's carriers per county (the census's phy_cnty), most first, kept for
        STATE_COUNTS_TTL. Carriers without a county code are left out."""
        state = state.upper()
        if state not in STATES:
            raise ValueError("Unknown state")
        key = f"counties:{state}:{status}"
        with _CACHE_LOCK:
            cached = _COUNTIES.get(key)
            if cached and self._now() - cached[0] < STATE_COUNTS_TTL:
                return cached[1]
        since = (self._today() - timedelta(days=NEW_DAYS)).strftime("%Y%m%d")
        base = f"{INTERSTATE[status]} AND phy_state='{state}'"
        totals = self._by_county(base)
        new = self._by_county(f"{base} AND add_date >= '{since}'")
        counts = sorted(
            (CountyCount(code, n, new.get(code, 0)) for code, n in totals.items()),
            key=lambda c: (-c.carriers, c.county),
        )
        with _CACHE_LOCK:
            _COUNTIES[key] = (self._now(), counts)
        return counts

    def _by_county(self, where: str) -> dict[str, int]:
        rows = self.client.get_rows(
            self.dataset,
            {
                "$select": "phy_cnty, count(*) AS n",
                "$where": where,
                "$group": "phy_cnty",
                "$limit": "1000",  # Texas has the most counties: 254
            },
        )
        return {
            str(row["phy_cnty"]): _int(row.get("n")) or 0
            for row in rows
            if is_county_code(row.get("phy_cnty"))
        }

    def _grouped(self, where: str) -> dict[str, int]:
        rows = self.client.get_rows(
            self.dataset,
            {
                "$select": "phy_state, count(*) AS n",
                "$where": where,
                "$group": "phy_state",
                "$limit": "200",
            },
        )
        return {
            str(row.get("phy_state")): _int(row.get("n")) or 0
            for row in rows
            if row.get("phy_state") in STATES
        }

    # --- Just registered, nationwide ------------------------------------------------------------

    def recent_registrations(self) -> list[RecentCarrier]:
        """The RECENT_LIMIT newest active interstate USDOT registrations in the 50 states and DC,
        kept for RECENT_TTL."""
        with _CACHE_LOCK:
            cached = _RECENT.get("recent")
            if cached and self._now() - cached[0] < RECENT_TTL:
                return cached[1]
        rows = self.client.get_rows(
            self.dataset,
            {
                "$select": "dot_number, legal_name, phy_city, phy_state, add_date",
                "$where": INTERSTATE["active"],
                "$order": "add_date DESC, dot_number DESC",
                "$limit": str(RECENT_LIMIT * 2),  # some are outside the 50 states and DC
            },
        )
        recent = [
            RecentCarrier(
                usdot_number=usdot,
                legal_name=str(row.get("legal_name") or "").strip(),
                city=(str(row["phy_city"]).strip().title() or None)
                if row.get("phy_city")
                else None,
                state=str(row["phy_state"]),
                registered_on=_day(row.get("add_date")),
            )
            for row in rows
            if (usdot := _int(row.get("dot_number"))) is not None and row.get("phy_state") in STATES
        ][:RECENT_LIMIT]
        with _CACHE_LOCK:
            _RECENT["recent"] = (self._now(), recent)
        return recent

    # --- One state's carriers ------------------------------------------------------------------

    def state_carriers(
        self,
        state: str,
        sort: Sort,
        letter: str | None = None,
        page: int = 0,
        status: Status = "active",
        size: int = PAGE_SIZE,
        county: str | None = None,
    ) -> StatePage:
        state = state.upper()
        if state not in STATES:
            raise ValueError("Unknown state")
        if county is not None and not is_county_code(county):
            raise ValueError("County must be a 3-digit code")
        if letter is not None and not (len(letter) == 1 and "A" <= letter.upper() <= "Z"):
            raise ValueError("Letter must be A-Z")
        where = f"{INTERSTATE[status]} AND phy_state='{state}'"
        if county:
            where += f" AND phy_cnty='{county}'"
        if letter:
            where += f" AND starts_with(upper(legal_name), '{letter.upper()}')"
        order = {
            "newest": "add_date DESC, dot_number DESC",
            "largest": "power_units::number DESC, dot_number",
            "az": "legal_name, dot_number",
            "new": "add_date DESC, dot_number DESC",
            "rated": "safety_rating_date DESC, dot_number",
        }[sort]
        if sort == "largest":
            where += " AND power_units IS NOT NULL"
        if sort == "new":
            since = (self._today() - timedelta(days=NEW_DAYS)).strftime("%Y%m%d")
            where += f" AND add_date >= '{since}'"
        if sort == "rated":
            where += " AND safety_rating='S'"
        rows = self.client.get_rows(
            self.dataset,
            {
                "$select": (
                    "dot_number, legal_name, dba_name, phy_city, phy_cnty, power_units, "
                    "total_drivers, add_date, safety_rating, safety_rating_date"
                ),
                "$where": where,
                "$order": order,
                "$limit": str(size + 1),
                "$offset": str(page * size),
            },
        )
        carriers = [self._carrier(row) for row in rows[:size]]
        return StatePage(
            state=state,
            name=STATES[state],
            sort=sort,
            letter=letter.upper() if letter else None,
            page=page,
            carriers=[c for c in carriers if c is not None],
            has_more=len(rows) > size,
            county=county,
        )

    def _carrier(self, row: dict) -> DirectoryCarrier | None:
        usdot = _int(row.get("dot_number"))
        if usdot is None:
            return None
        units = _int(row.get("power_units"))
        registered = _day(row.get("add_date"))
        young = registered is not None and (self._today() - registered) < timedelta(
            days=365 * REPORTED_FLEET_CHECK_YEARS
        )
        return DirectoryCarrier(
            usdot_number=usdot,
            legal_name=str(row.get("legal_name") or "").strip(),
            dba_name=(str(row["dba_name"]).strip() or None) if row.get("dba_name") else None,
            city=(str(row["phy_city"]).strip().title() or None) if row.get("phy_city") else None,
            county_code=str(row["phy_cnty"]) if row.get("phy_cnty") else None,
            power_units=units,
            drivers=_int(row.get("total_drivers")),
            registered_on=registered,
            fleet_needs_check=bool(young and units and units >= REPORTED_FLEET_CHECK_UNITS),
            rated_on=_day(row.get("safety_rating_date"))
            if row.get("safety_rating") == "S"
            else None,
        )


_CACHE: dict[str, tuple[float, list[StateCount]]] = {}
_RECENT: dict[str, tuple[float, list[RecentCarrier]]] = {}
_COUNTIES: dict[str, tuple[float, list[CountyCount]]] = {}
_CACHE_LOCK = threading.Lock()


def clear_cache() -> None:
    """Tests start from an empty cache."""
    with _CACHE_LOCK:
        _CACHE.clear()
        _RECENT.clear()
        _COUNTIES.clear()
