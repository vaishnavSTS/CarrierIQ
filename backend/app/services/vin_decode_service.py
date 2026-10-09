"""Decode a carrier's VINs with NHTSA vPIC, once per VIN (spec Phase 7).

Only vehicles never decoded are sent; a decode never changes, so it is kept permanently. Each
vPIC result is stored as a raw record. A failed decode leaves the vehicles undecoded, so they
are tried again on the next refresh.
"""

import logging
from dataclasses import asdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import SourceFetchError
from app.ingestion.fingerprint import payload_hash
from app.ingestion.vpic import VpicClient
from app.ingestion.vpic_normalizer import decoded_vehicle
from app.models import Carrier, RawRecord, Vehicle
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.services.vehicle_observation_service import USDOT, VIN_OBSERVED_WITH

logger = logging.getLogger(__name__)


class VinDecodeService:
    def __init__(
        self,
        db: Session,
        client: VpicClient,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
        relationships: RelationshipRepository,
    ) -> None:
        self.db = db
        self.client = client
        self.runs = runs
        self.raw_records = raw_records
        self.relationships = relationships

    def decode_for_carrier(self, carrier: Carrier) -> int:
        """Decode the carrier's undecoded VINs; returns how many were decoded. Never raises for
        a vPIC outage (logged and retried next refresh): decoding only enriches."""
        links = self.relationships.to_target(VIN_OBSERVED_WITH, (USDOT, carrier.usdot_number))
        pending = list(
            self.db.scalars(
                select(Vehicle).where(
                    Vehicle.id.in_({link.source_entity_id for link in links}),
                    Vehicle.decoded_at.is_(None),
                )
            )
        )
        if not pending:
            return 0

        run = self.runs.start(
            self.client.source,
            self.client.dataset_id,
            f"{len(pending)} VINs for dot_number={carrier.usdot_number}",
        )
        self.db.commit()
        try:
            results = self.client.decode([v.vin for v in pending])
        except SourceFetchError as exc:
            self.runs.fail(run, exc.message)
            self.db.commit()
            logger.warning("VIN decoding for USDOT %d failed: %s", carrier.usdot_number, exc)
            return 0

        by_vin = {v.vin: v for v in pending}
        now = datetime.now(UTC)
        matched = []
        for row in results:
            values = decoded_vehicle(row)
            vehicle = by_vin.get(values.vin) if values else None
            if values is None or vehicle is None:
                continue
            raw = RawRecord(
                source=self.client.source,
                dataset_id=self.client.dataset_id,
                external_id=values.vin,
                payload=row,
                payload_hash=payload_hash(row),
                ingestion_run_id=run.id,
            )
            matched.append((vehicle, values, raw))
        self.raw_records.add_many([raw for _, _, raw in matched])  # one batch, ids assigned
        for vehicle, values, raw in matched:
            for name, value in asdict(values).items():
                if name != "vin":
                    setattr(vehicle, name, value)
            vehicle.decoded_at = now
            vehicle.decode_raw_record_id = raw.id
        decoded = len(matched)
        self.runs.succeed(run, records_fetched=len(results))
        self.db.commit()
        logger.info("USDOT %d: decoded %d of %d VINs", carrier.usdot_number, decoded, len(pending))
        return decoded


def build_vin_decode_service(db: Session, client: VpicClient | None = None) -> VinDecodeService:
    return VinDecodeService(
        db,
        client or VpicClient(),
        IngestionRunRepository(db),
        RawRecordRepository(db),
        RelationshipRepository(db),
    )
