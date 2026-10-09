"""Carriers that share contact details (spec Sections 11.4, 29; Network / Fraud tab).

During each refresh, the carrier's phones, email, physical address and officer names are looked
up across the whole FMCSA Company Census File in one query. Every other USDOT number that shares
one of them becomes a relationship from this carrier: SHARES_PHONE, SHARES_EMAIL, SHARES_ADDRESS
(same street address and unit), SHARES_BUILDING (same street address, another unit) or
SHARES_OFFICER, each traced to the other carrier's census row as received.

A link records a fact, not a judgement: family businesses, shared offices and dispatch or
compliance services legitimately share details. The shared_contact rule decides what is worth
a review signal.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import CarrierNotFoundError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.contact_match import (
    ADDRESS,
    BUILDING,
    EMAIL,
    OFFICER,
    PHONE,
    ContactKeys,
    Match,
    build_where,
    classify,
    keys_for,
)
from app.ingestion.socrata_client import Row, SocrataClient
from app.models import Address, Carrier, Officer, Phone
from app.models.enums import AddressType, Confidence
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.relationship_repository import LinkValues, RelationshipRepository
from app.services.dataset_batch import DatasetBatch
from app.services.vehicle_observation_service import USDOT

logger = logging.getLogger(__name__)

LINK_TYPE = {
    PHONE: "SHARES_PHONE",
    EMAIL: "SHARES_EMAIL",
    ADDRESS: "SHARES_ADDRESS",
    BUILDING: "SHARES_BUILDING",
    OFFICER: "SHARES_OFFICER",
}
CONTACT_LINK_TYPES = tuple(LINK_TYPE.values())
# How directly a shared value ties two records together (spec 13.1).
LINK_CONFIDENCE = {
    PHONE: Confidence.HIGH,
    EMAIL: Confidence.HIGH,
    ADDRESS: Confidence.HIGH,
    BUILDING: Confidence.LOW,
    OFFICER: Confidence.MEDIUM,  # the same name can belong to different people
}


def raw_key(usdot_number: int | str) -> str:
    """Raw-record key for another carrier's census row seen as a contact match.

    Never the bare USDOT number: that key is the carrier's own census record, and storing a
    match under it would make that carrier's next census fetch look unchanged.
    """
    return f"contact-link:{usdot_number}"


@dataclass(frozen=True)
class ContactLinkResult:
    matches: int  # census rows returned
    linked_carriers: int
    links: int
    truncated: bool  # the source returned the maximum number of rows


def contact_keys(carrier: Carrier, observed: ObservedValueRepository) -> ContactKeys:
    """The carrier's current phones, email, physical address and officers, ready to match."""
    physical = next(
        (
            a
            for a in observed.current(Address, carrier.id)
            if a.address_type == AddressType.PHYSICAL
        ),
        None,
    )
    return keys_for(
        [p.number_normalized for p in observed.current(Phone, carrier.id)],
        carrier.email,
        physical.street if physical else None,
        physical.zip if physical else None,
        [o.name for o in observed.current(Officer, carrier.id)],
    )


class ContactLinkService:
    def __init__(
        self,
        db: Session,
        adapter: CompanyCensusAdapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        carriers: CarrierRepository,
        observed: ObservedValueRepository,
        relationships: RelationshipRepository,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records
        self.carriers = carriers
        self.observed = observed
        self.relationships = relationships
        self.today = today
        self.limit = get_settings().contact_link_limit

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return f"contact links for dot_number={usdot_number}"

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        return self.runs.last_success_at(
            self.adapter.source, self.adapter.dataset_id, self.query_for(usdot_number)
        )

    def ingest(self, usdot_number: int) -> ContactLinkResult:
        carrier = self.carriers.get_by_usdot(usdot_number)
        if carrier is None:
            raise CarrierNotFoundError(
                f"USDOT {usdot_number} is not loaded yet; ingest its census record first"
            )
        keys = contact_keys(carrier, self.observed)
        where = build_where(keys)

        a = self.adapter
        batch = DatasetBatch(
            self.db, self.runs, self.raw_records, a.source, f"USDOT {usdot_number}"
        )
        run, rows = batch.fetch(
            a.dataset_id,
            self.query_for(usdot_number),
            lambda: a.find_contact_matches(where, self.limit) if where else [],
        )
        matches: dict[int, tuple[Row, Match]] = {}
        for row in rows:
            dot_text = str(row.get("dot_number", ""))
            if not dot_text.isdigit() or int(dot_text) == usdot_number:
                continue
            match = classify(row, keys)
            if match.kinds:
                matches[int(dot_text)] = (row, match)
        stored = batch.store(
            a.dataset_id,
            [row for row, _ in matches.values()],
            run,
            lambda row: raw_key(row["dot_number"]),
        )

        today = self.today()
        source = (USDOT, usdot_number)
        existing = {
            (link.relationship_type, link.target_entity_id): link
            for link in self.relationships.from_source(source, CONTACT_LINK_TYPES)
        }
        links = []
        for dot, (_, match) in matches.items():
            raw = stored[raw_key(dot)][0]
            for kind in sorted(match.kinds):
                earlier = existing.pop((LINK_TYPE[kind], dot), None)
                links.append(
                    LinkValues(
                        source=source,
                        relationship_type=LINK_TYPE[kind],
                        target=(USDOT, dot),
                        first_seen=earlier.first_seen if earlier else today,
                        last_seen=today,
                        observation_count=(earlier.observation_count + 1) if earlier else 1,
                        confidence=LINK_CONFIDENCE[kind],
                        raw_record_id=raw.id,
                    )
                )
        # Details no longer shared (either side changed them) are no longer links.
        self.relationships.delete_many(list(existing.values()))
        self.relationships.upsert_many(links)

        batch.succeed({run: len(rows)})
        self.db.commit()
        truncated = len(rows) >= self.limit
        logger.info(
            "USDOT %d: %d other carriers share contact details (%d links)%s",
            usdot_number,
            len(matches),
            len(links),
            "; results cut off" if truncated else "",
        )
        return ContactLinkResult(len(rows), len(matches), len(links), truncated)


def build_contact_link_service(
    db: Session, client: SocrataClient | None = None
) -> ContactLinkService:
    return ContactLinkService(
        db,
        CompanyCensusAdapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        CarrierRepository(db),
        ObservedValueRepository(db),
        RelationshipRepository(db),
    )
