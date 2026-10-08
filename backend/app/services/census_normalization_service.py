"""Apply a stored Company Census raw record to the canonical and history tables
(spec Sections 11.3, 19.3, 20)."""

import logging
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime

from app.ingestion.company_census_normalizer import CarrierValues, normalize_census_row
from app.models import Address, Carrier, Domain, Officer, Phone, RawRecord
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_history_repository import CarrierHistoryRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.observed_value_repository import ObservedValueRepository

logger = logging.getLogger(__name__)

# Carrier fields whose every change is kept in carrier_attribute_history.
TRACKED_ATTRIBUTES = tuple(
    name for name in CarrierValues.__dataclass_fields__ if name != "usdot_number"
)


@dataclass(frozen=True)
class NormalizationOutcome:
    carrier: Carrier
    # Attributes whose value changed (on a carrier's first load: every attribute with a value).
    changed_attributes: tuple[str, ...]


class CensusNormalizationService:
    def __init__(
        self,
        carriers: CarrierRepository,
        observed: ObservedValueRepository,
        authorities: AuthorityRepository,
        history: CarrierHistoryRepository,
    ) -> None:
        self.carriers = carriers
        self.observed = observed
        self.authorities = authorities
        self.history = history

    def apply(self, raw_record: RawRecord, *, is_new_record: bool) -> NormalizationOutcome:
        """Raises SourceDataError if the record cannot be normalized; nothing is written then.

        `is_new_record` is True when this raw record was just stored (first fetch or the source
        changed); only then is a snapshot taken.
        """
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
        self.authorities.sync(
            carrier.id, record.authorities, source=source, raw_record_id=raw_id, as_of=today
        )

        changed = self.history.record_changes(
            carrier.id,
            history_values(record.carrier),
            observed_on=today,
            source=source,
            raw_record_id=raw_id,
        )
        if is_new_record:
            self.history.add_snapshot(
                carrier.id,
                snapshot_date=today,
                data_hash=raw_record.payload_hash,
                source=source,
                raw_record_id=raw_id,
            )

        logger.info(
            "USDOT %d normalized from raw record %d (carrier %d); changed: %s",
            carrier.usdot_number,
            raw_id,
            carrier.id,
            ", ".join(changed) or "nothing",
        )
        return NormalizationOutcome(carrier=carrier, changed_attributes=tuple(changed))


def history_values(values: CarrierValues) -> dict[str, str | None]:
    """Tracked attributes as text: dates in ISO format, numbers as digits, empty as None."""
    fields = asdict(values)
    return {name: _as_text(fields[name]) for name in TRACKED_ATTRIBUTES}


def _as_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return str(value)
