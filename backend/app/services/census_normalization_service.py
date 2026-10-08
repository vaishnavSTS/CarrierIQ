"""Apply a stored Company Census raw record to the canonical tables (spec Section 19.3)."""

import logging
from datetime import UTC, datetime

from app.ingestion.company_census_normalizer import normalize_census_row
from app.models import Address, Carrier, Domain, Officer, Phone, RawRecord
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.observed_value_repository import ObservedValueRepository

logger = logging.getLogger(__name__)


class CensusNormalizationService:
    def __init__(
        self,
        carriers: CarrierRepository,
        observed: ObservedValueRepository,
        authorities: AuthorityRepository,
    ) -> None:
        self.carriers = carriers
        self.observed = observed
        self.authorities = authorities

    def apply(self, raw_record: RawRecord) -> Carrier:
        """Raises SourceDataError if the record cannot be normalized; nothing is written then."""
        record = normalize_census_row(raw_record.payload)
        now = datetime.now(UTC)
        source, raw_id, today = raw_record.source, raw_record.id, now.date()

        carrier = self.carriers.upsert(record.carrier, refreshed_at=now)
        sync = self.observed.sync
        sync(
            Address,
            carrier.id,
            record.addresses,
            seen_on=today,
            source=source,
            raw_record_id=raw_id,
        )
        sync(Phone, carrier.id, record.phones, seen_on=today, source=source, raw_record_id=raw_id)
        sync(
            Officer, carrier.id, record.officers, seen_on=today, source=source, raw_record_id=raw_id
        )
        sync(Domain, carrier.id, record.domains, seen_on=today, source=source, raw_record_id=raw_id)
        self.authorities.sync(carrier.id, record.authorities, source=source, raw_record_id=raw_id)

        logger.info(
            "USDOT %d normalized from raw record %d (carrier %d)",
            carrier.usdot_number,
            raw_record.id,
            carrier.id,
        )
        return carrier
