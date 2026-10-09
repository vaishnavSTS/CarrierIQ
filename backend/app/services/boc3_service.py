"""Fetch a carrier's BOC-3 (process agent) filings from FMCSA's Motus and old L&I data.

A refresh detail source, stored like registration orders: each dataset's full answer for the
carrier is one raw record (`{"rows": [...]}`, keyed by USDOT number), so the latest record is
always the current list. `process_agents()` reads them back for the Authority tab and the
registration checks.
"""

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.boc3 import SOURCE, Boc3Adapter
from app.ingestion.socrata_client import SocrataClient
from app.models import ProcessAgent as ProcessAgentRow
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.ingestion_run_repository import IngestionRunRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.safety_record_repository import SafetyRecordRepository
from app.services.dataset_batch import DatasetBatch

logger = logging.getLogger(__name__)

_DOCKET = re.compile(r"^([A-Z]+)0*(\d+)$")


@dataclass(frozen=True)
class ProcessAgent:
    docket: str | None  # e.g. MC207446
    name: str
    attention: str | None  # contact person (old L&I data only)
    city: str | None
    state: str | None
    source_system: str  # MOTUS | LEGACY_LI


def _docket(value: object) -> str | None:
    found = _DOCKET.match(str(value or "").strip().upper())
    return f"{found.group(1)}{found.group(2)}" if found else None


def _text(row: dict[str, Any], key: str) -> str | None:
    value = " ".join(str(row.get(key) or "").split()).strip(" ,")
    return value or None


def _agents(rows: list[dict[str, Any]], source_system: str) -> list[ProcessAgent]:
    found: dict[tuple[str | None, str], ProcessAgent] = {}
    for row in rows:
        name = _text(row, "co_name")
        if not name:
            continue
        agent = ProcessAgent(
            docket=_docket(row.get("docket_number")),
            name=name,
            attention=_text(row, "attn_to_or_title"),
            city=_text(row, "city"),
            state=_text(row, "state_code"),
            source_system=source_system,
        )
        found.setdefault((agent.docket, name.upper()), agent)
    return list(found.values())


def process_agents(db: Session, usdot_number: int) -> list[ProcessAgent] | None:
    """Current process agents from `process_agents`; None when BOC-3 data was never fetched."""
    runs = IngestionRunRepository(db)
    if (
        runs.last_success_at(SOURCE, get_settings().legacy_boc3_dataset_id, _query(usdot_number))
        is None
    ):
        return None
    carrier = CarrierRepository(db).get_by_usdot(usdot_number)
    if carrier is None:
        return []
    return [
        ProcessAgent(
            docket=a.docket or None,
            name=a.name,
            attention=a.attention,
            city=a.city,
            state=a.state,
            source_system=a.source_system,
        )
        for a in SafetyRecordRepository(db).current_agents(carrier.id)
    ]


def _query(usdot_number: int) -> str:
    return f"dot_number={usdot_number}"


@dataclass(frozen=True)
class Boc3Result:
    motus: int
    legacy: int


class Boc3Service:
    def __init__(
        self,
        db: Session,
        adapter: Boc3Adapter,
        runs: IngestionRunRepository,
        raw_records: RawRecordRepository,
    ) -> None:
        self.db = db
        self.adapter = adapter
        self.runs = runs
        self.raw_records = raw_records

    @staticmethod
    def query_for(usdot_number: int) -> str:
        return _query(usdot_number)

    def last_refreshed_at(self, usdot_number: int) -> datetime | None:
        return self.runs.last_success_at(
            self.adapter.source, self.adapter.legacy_dataset_id, self.query_for(usdot_number)
        )

    def ingest(self, usdot_number: int) -> Boc3Result:
        a = self.adapter
        query = self.query_for(usdot_number)
        batch = DatasetBatch(
            self.db, self.runs, self.raw_records, a.source, f"USDOT {usdot_number}"
        )
        motus_run, motus = batch.fetch(
            a.motus_dataset_id, query, lambda: a.fetch_motus(usdot_number)
        )
        legacy_run, legacy = batch.fetch(
            a.legacy_dataset_id, query, lambda: a.fetch_legacy(usdot_number)
        )
        key = str(usdot_number)
        motus_raw = batch.store(a.motus_dataset_id, [{"rows": motus}], motus_run, lambda _: key)
        legacy_raw = batch.store(a.legacy_dataset_id, [{"rows": legacy}], legacy_run, lambda _: key)
        carrier = CarrierRepository(self.db).get_by_usdot(usdot_number)
        if carrier is not None:
            found = [(agent, motus_raw[key][0].id) for agent in _agents(motus, "MOTUS")] + [
                (agent, legacy_raw[key][0].id) for agent in _agents(legacy, "LEGACY_LI")
            ]
            SafetyRecordRepository(self.db).sync_agents(
                carrier.id,
                [
                    (
                        ProcessAgentRow(
                            docket=agent.docket or "",
                            name=agent.name[:200],
                            attention=agent.attention,
                            city=agent.city,
                            state=agent.state,
                            source_system=agent.source_system,
                        ),
                        raw_id,
                    )
                    for agent, raw_id in found
                ],
                a.source,
                datetime.now(UTC).date(),
            )
        batch.succeed({motus_run: len(motus), legacy_run: len(legacy)})
        self.db.commit()
        logger.info(
            "USDOT %d: %d Motus and %d legacy BOC-3 rows", usdot_number, len(motus), len(legacy)
        )
        return Boc3Result(len(motus), len(legacy))


def build_boc3_service(db: Session, client: SocrataClient | None = None) -> Boc3Service:
    return Boc3Service(
        db,
        Boc3Adapter(client or SocrataClient()),
        IngestionRunRepository(db),
        RawRecordRepository(db),
    )
