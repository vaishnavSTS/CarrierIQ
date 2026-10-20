"""Chameleon check for one carrier: the other USDOT numbers that share its identity details, what
happened to them, and how much of its fleet was also inspected under other USDOT numbers.

A chameleon carrier is an operation that re-registers under a new name and USDOT number to leave
a bad record (revocation, out-of-service order) behind, usually keeping its people, phone,
address, business record or trucks. This puts those pieces side by side:

- shared details: the contact links (phone, email, address, building, officer) plus the DUNS
  number, mailing address and former phones / addresses (services/contact_link_service.py);
- what happened to each linked carrier: FMCSA revocation / suspension and out-of-service orders,
  fetched for all of them in one query per dataset, and how long after that this carrier's USDOT
  number was added;
- fleet overlap: of the power units seen on this carrier's inspections in the last 24 months,
  how many VINs were also inspected under another USDOT number (CarrierOK flags 60% or more);
- FMCSA's own prior-revocation flag from the census.

It reports what the records show and never a verdict: fleets under common ownership, family
businesses, shared registered agents or office suites and dispatch services legitimately share
details, and leased or sold trucks move between carriers.
"""

import logging
from collections import Counter, defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import CarrierNotFoundError, SourceFetchError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.contact_match import (
    ADDRESS,
    BUILDING,
    DUNS,
    EMAIL,
    MAILING,
    OFFICER,
    PAST_ADDRESS,
    PAST_PHONE,
    PHONE,
    classify,
)
from app.ingestion.fmcsa_values import yyyymmdd
from app.ingestion.registration_orders import RegistrationOrdersAdapter
from app.models import RawRecord
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.schemas.carrier_equipment import EquipmentVehicleOut
from app.schemas.chameleon import (
    ChameleonLinkedOut,
    ChameleonOut,
    ChameleonShareOut,
    ChameleonSummaryOut,
    FleetOverlapOut,
    PriorRevokeOut,
)
from app.services.carrier_equipment_service import RECENT_MONTHS, EquipmentReader
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.contact_link_service import CHAMELEON_LINK_TYPES, LINK_TYPE, ContactLinkService
from app.services.contact_link_service import contact_keys as build_contact_keys
from app.services.vehicle_observation_service import USDOT

logger = logging.getLogger(__name__)

MAX_LINKED = 50  # linked carriers looked up (orders) and listed
MIN_SHARED_VINS = 2  # carriers linked by trucks alone are listed from this many shared VINs
FLEET_THRESHOLD_PERCENT = 60  # CarrierOK's flag level for shared power units
LINK_MAX_AGE = timedelta(hours=24)  # re-check shared details when the last check is older
WITHIN_DAYS = 365  # "added within a year after a shutdown"

# Link type -> (kind shown, a former value of this carrier).
KIND_OF: dict[str, tuple[str, bool]] = {
    LINK_TYPE[PHONE]: ("phone", False),
    LINK_TYPE[EMAIL]: ("email", False),
    LINK_TYPE[ADDRESS]: ("address", False),
    LINK_TYPE[BUILDING]: ("building", False),
    LINK_TYPE[OFFICER]: ("officer", False),
    LINK_TYPE[DUNS]: ("duns", False),
    LINK_TYPE[MAILING]: ("mailing_address", False),
    LINK_TYPE[PAST_PHONE]: ("phone", True),
    LINK_TYPE[PAST_ADDRESS]: ("address", True),
}
# The value classify() records for each link type's match.
MATCH_KIND = {
    LINK_TYPE[k]: k
    for k in (PHONE, EMAIL, ADDRESS, BUILDING, OFFICER, DUNS, MAILING, PAST_PHONE, PAST_ADDRESS)
}
# Strongest first: one business record, then contact details, then people, then the building.
STRENGTH = ["duns", "phone", "email", "address", "mailing_address", "officer", "building"]


@dataclass
class Linked:
    """One linked USDOT number while the check is assembled."""

    usdot_number: int
    shares: list[ChameleonShareOut] = field(default_factory=list)
    shared_vins: int = 0
    payload: dict[str, Any] = field(default_factory=dict)
    first_linked: date | None = None

    @property
    def distinct_kinds(self) -> int:
        return len({s.kind for s in self.shares if s.kind != "building"})


def fleet_overlap(rows: Sequence[EquipmentVehicleOut], today: date) -> FleetOverlapOut:
    """Power units seen in the last RECENT_MONTHS and how many of their VINs were also seen
    under another USDOT number."""
    since = today - timedelta(days=round(RECENT_MONTHS * 365.25 / 12))
    power = [
        r
        for r in rows
        if r.vehicle_type and r.vehicle_type.upper() != "TRAILER" and r.last_seen >= since
    ]
    shared = sum(1 for r in power if r.other_carriers)
    percent = round(100 * shared / len(power), 1) if power else None
    return FleetOverlapOut(
        window_months=RECENT_MONTHS,
        power_units_seen=len(power),
        shared_power_units=shared,
        percent=percent,
        threshold_percent=FLEET_THRESHOLD_PERCENT,
        over_threshold=percent is not None and percent >= FLEET_THRESHOLD_PERCENT,
    )


@dataclass(frozen=True)
class Orders:
    revocations: list[date]
    oos_orders: list[date]
    active_oos_order: bool

    @property
    def shutdown_date(self) -> date | None:
        return max([*self.revocations, *self.oos_orders], default=None)


def orders_for(oos_rows: Sequence[dict[str, Any]], revoke_rows: Sequence[dict[str, Any]]) -> Orders:
    """Dates of one carrier's out-of-service and revocation / suspension orders."""
    return Orders(
        revocations=sorted(
            {d for r in revoke_rows if (d := yyyymmdd(r, "order1_serve_date")) is not None}
        ),
        oos_orders=sorted({d for r in oos_rows if (d := yyyymmdd(r, "oos_date")) is not None}),
        active_oos_order=any(str(r.get("status", "")).upper() == "ACTIVE" for r in oos_rows),
    )


def days_after(registered: date | None, shutdown: date | None) -> int | None:
    """Days from a linked carrier's shutdown to this carrier's USDOT add date."""
    if registered is None or shutdown is None:
        return None
    return (registered - shutdown).days


def sort_key(row: ChameleonLinkedOut) -> tuple[int, int, int, int, int]:
    """Shut down and sharing 2+ kinds first, then more kinds, more shared VINs, shut down."""
    shut = row.shutdown_date is not None
    return (
        0 if shut and row.distinct_kinds >= 2 else 1,
        -row.distinct_kinds,
        -row.shared_vins,
        0 if shut else 1,
        row.usdot_number,
    )


def summarize(rows: Sequence[ChameleonLinkedOut]) -> ChameleonSummaryOut:
    return ChameleonSummaryOut(
        linked_carriers=len(rows),
        shut_down=sum(1 for r in rows if r.shutdown_date is not None),
        sharing_two_or_more=sum(1 for r in rows if r.distinct_kinds >= 2),
        added_within_year_after_shutdown=sum(
            1
            for r in rows
            if r.days_after_shutdown is not None and 0 <= r.days_after_shutdown <= WITHIN_DAYS
        ),
    )


def _census_date(payload: dict[str, Any], name: str) -> date | None:
    value = str(payload.get(name) or "")
    if len(value) < 8 or not value[:8].isdigit():
        return None
    try:
        return date(int(value[:4]), int(value[4:6]), int(value[6:8]))
    except ValueError:
        return None


def prior_revoke(usdot_number: int, census: dict[str, Any]) -> PriorRevokeOut:
    other = str(census.get("prior_revoke_dot_number") or "")
    return PriorRevokeOut(
        flagged=census.get("prior_revoke_flag") == "Y",
        usdot_number=int(other) if other.isdigit() and int(other) != usdot_number else None,
    )


class ChameleonService:
    def __init__(
        self,
        db: Session,
        refresh: CarrierRefreshService,
        contact_links: ContactLinkService,
        orders: RegistrationOrdersAdapter,
        equipment: EquipmentReader,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.db = db
        self.refresh = refresh
        self.contact_links = contact_links
        self.orders = orders
        self.equipment = equipment
        self.today = today
        self.now = now
        self.observed = ObservedValueRepository(db)
        self.relationships = RelationshipRepository(db)
        self.raw_records = RawRecordRepository(db)
        self.carriers = CarrierRepository(db)

    def get(self, usdot_number: int) -> ChameleonOut:
        carrier = self.refresh.ensure_fresh(usdot_number).carrier
        if carrier is None:
            raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number}")
        notes: list[str] = []
        checked_at = self._fresh_links(usdot_number, notes)

        census_record = self.raw_records.latest(
            CompanyCensusAdapter.source, get_settings().census_dataset_id, str(usdot_number)
        )
        census = census_record.payload if census_record else {}
        keys = build_contact_keys(carrier, self.observed, census)
        links = self.relationships.from_source((USDOT, usdot_number), CHAMELEON_LINK_TYPES)
        raws = {
            r.id: r.payload
            for r in self.db.query(RawRecord).filter(
                RawRecord.id.in_({link.raw_record_id for link in links if link.raw_record_id})
            )
        }

        linked: dict[int, Linked] = {}
        values: dict[int, dict[str, str]] = {}
        for link in links:
            other = linked.setdefault(link.target_entity_id, Linked(link.target_entity_id))
            payload = raws.get(link.raw_record_id or -1)
            if payload is not None:
                other.payload = payload
            if link.target_entity_id not in values:
                values[link.target_entity_id] = classify(other.payload, keys).values
            kind, past = KIND_OF[link.relationship_type]
            other.shares.append(
                ChameleonShareOut(
                    kind=kind,
                    value=values[link.target_entity_id].get(MATCH_KIND[link.relationship_type]),
                    past=past,
                )
            )
            other.first_linked = min(filter(None, [other.first_linked, link.first_seen]))

        equipment = self.equipment.read(carrier)
        vin_counts = Counter(c.usdot_number for r in equipment.vehicles for c in r.other_carriers)
        for dot, count in vin_counts.items():
            if dot in linked:
                linked[dot].shared_vins = count
            elif count >= MIN_SHARED_VINS:
                linked[dot] = Linked(dot, shared_vins=count)

        # Strongest candidates first, so the cap keeps the ones worth a look.
        candidates = sorted(
            linked.values(), key=lambda o: (-o.distinct_kinds, -o.shared_vins, o.usdot_number)
        )
        truncated = len(candidates) > MAX_LINKED
        candidates = candidates[:MAX_LINKED]
        orders, orders_checked = self._orders([o.usdot_number for o in candidates])
        if not orders_checked:
            notes.append(
                "FMCSA's revocation and out-of-service order data could not be reached just now, "
                "so shutdown dates are missing. Try again later."
            )
        names = self.carriers.legal_names(o.usdot_number for o in candidates if not o.payload)
        registered = carrier.first_registered_date

        rows = [self._row(o, orders.get(o.usdot_number), names, registered) for o in candidates]
        rows.sort(key=sort_key)
        return ChameleonOut(
            usdot_number=usdot_number,
            registered=registered,
            prior_revoke=prior_revoke(usdot_number, census),
            fleet_overlap=fleet_overlap(equipment.vehicles, self.today()),
            linked=rows,
            summary=summarize(rows),
            links_checked_at=checked_at,
            orders_checked=orders_checked,
            truncated=truncated,
            note=" ".join(notes) or None,
        )

    def _fresh_links(self, usdot_number: int, notes: list[str]) -> datetime | None:
        """Re-check shared details with FMCSA when the last check is old or missing."""
        checked = self.contact_links.last_refreshed_at(usdot_number)
        stale = checked is None or _aware(checked) < self.now() - LINK_MAX_AGE
        if stale:
            try:
                self.contact_links.ingest(usdot_number)
                checked = self.contact_links.last_refreshed_at(usdot_number)
            except (SourceFetchError, httpx.HTTPError) as exc:
                self.db.rollback()
                logger.warning("USDOT %d: shared details not re-checked: %s", usdot_number, exc)
                notes.append(
                    "Shared details could not be re-checked with FMCSA just now; showing the "
                    "last check."
                )
        return checked

    def _orders(self, usdot_numbers: list[int]) -> tuple[dict[int, Orders], bool]:
        if not usdot_numbers:
            return {}, True
        try:
            oos = self.orders.fetch_oos_orders_many(usdot_numbers)
            revocations = self.orders.fetch_revocations_many(usdot_numbers)
        except (SourceFetchError, httpx.HTTPError) as exc:
            logger.warning("Orders for linked carriers not fetched: %s", exc)
            return {}, False
        oos_by: dict[int, list[dict[str, Any]]] = defaultdict(list)
        revoke_by: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in oos:
            if str(row.get("dot_number", "")).isdigit():
                oos_by[int(row["dot_number"])].append(row)
        for row in revocations:
            if str(row.get("usdot_number", "")).isdigit():
                revoke_by[int(row["usdot_number"])].append(row)
        return {n: orders_for(oos_by[n], revoke_by[n]) for n in usdot_numbers}, True

    @staticmethod
    def _row(
        other: Linked,
        orders: Orders | None,
        names: dict[int, str],
        registered: date | None,
    ) -> ChameleonLinkedOut:
        status = other.payload.get("status_code")
        shares = sorted(other.shares, key=lambda s: (STRENGTH.index(s.kind), s.past))
        shutdown = orders.shutdown_date if orders else None
        return ChameleonLinkedOut(
            usdot_number=other.usdot_number,
            legal_name=other.payload.get("legal_name") or names.get(other.usdot_number),
            status="ACTIVE" if status == "A" else ("INACTIVE" if status else None),
            registered=_census_date(other.payload, "add_date"),
            shares=shares,
            distinct_kinds=other.distinct_kinds,
            shared_vins=other.shared_vins,
            revocations=orders.revocations if orders else [],
            oos_orders=orders.oos_orders if orders else [],
            active_oos_order=orders.active_oos_order if orders else False,
            shutdown_date=shutdown,
            days_after_shutdown=days_after(registered, shutdown),
            first_linked=other.first_linked,
        )


def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)
