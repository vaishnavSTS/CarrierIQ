"""Database access for crashes, sms_results and process_agents.

Each is written from the raw FMCSA rows just stored, so every row points at its raw record.
- crashes: upserted by report; older reports stay (crash history is kept).
- sms_results: one set per carrier and month, replaced if fetched again that month.
- process_agents: upserted; agents no longer listed are kept but marked not current.
"""

from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Crash, ProcessAgent, SmsResult
from app.schemas.carrier_safety import CrashOut, SmsOut


class SafetyRecordRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # crashes

    def sync_crashes(
        self,
        carrier_id: int,
        crashes: Sequence[tuple[CrashOut, int, str | None]],
        source: str,
        raw_record_id: int,
    ) -> None:
        """(crash, the carrier's vehicles in the report, first VIN) per report."""
        existing = {
            c.crash_id: c
            for c in self.db.scalars(
                select(Crash).where(Crash.carrier_id == carrier_id, Crash.source == source)
            )
        }
        for crash, vehicles, vin in crashes:
            row = existing.get(crash.report_number) or Crash(
                crash_id=crash.report_number, carrier_id=carrier_id, source=source
            )
            row.crash_date = crash.report_date
            row.state = crash.state
            row.city = crash.city
            row.fatalities = crash.fatalities
            row.injuries = crash.injuries
            row.tow_away = crash.tow_away
            row.hazmat_released = crash.hazmat_released
            row.vehicles = vehicles
            row.vin = vin
            row.raw_record_id = raw_record_id
            self.db.add(row)
        self.db.flush()

    def crashes(self, carrier_id: int, since: date) -> list[Crash]:
        """Newest first."""
        return list(
            self.db.scalars(
                select(Crash)
                .where(Crash.carrier_id == carrier_id, Crash.crash_date >= since)
                .order_by(Crash.crash_date.desc(), Crash.crash_id)
            )
        )

    # sms_results

    def sync_sms(
        self, carrier_id: int, month: date, sms: SmsOut, source: str, raw_record_id: int
    ) -> None:
        self.db.execute(
            delete(SmsResult).where(
                SmsResult.carrier_id == carrier_id, SmsResult.snapshot_month == month
            )
        )
        assert sms.dataset_id is not None and sms.dataset is not None
        self.db.add_all(
            SmsResult(
                carrier_id=carrier_id,
                snapshot_month=month,
                dataset_id=sms.dataset_id,
                dataset=sms.dataset,
                passenger=sms.passenger,
                inspections=sms.inspections,
                driver_inspections=sms.driver_inspections,
                vehicle_inspections=sms.vehicle_inspections,
                basic=b.key,
                label=b.label,
                inspections_with_violation=b.inspections_with_violation,
                measure=Decimal(str(b.measure)) if b.measure is not None else None,
                percentile=Decimal(str(b.percentile)) if b.percentile is not None else None,
                over_threshold=b.over_threshold,
                alert=b.alert,
                acute_critical=b.acute_critical,
                note=b.note,
                source=source,
                raw_record_id=raw_record_id,
            )
            for b in sms.basics
        )
        self.db.flush()

    def clear_sms_month(self, carrier_id: int, month: date) -> None:
        """The carrier is in no SMS file this month."""
        self.db.execute(
            delete(SmsResult).where(
                SmsResult.carrier_id == carrier_id, SmsResult.snapshot_month == month
            )
        )

    def latest_sms(self, carrier_id: int) -> list[SmsResult]:
        """The most recent month's rows, in FMCSA's BASIC order (by id: inserted in order)."""
        month = self.db.scalar(
            select(func.max(SmsResult.snapshot_month)).where(SmsResult.carrier_id == carrier_id)
        )
        if month is None:
            return []
        return list(
            self.db.scalars(
                select(SmsResult)
                .where(SmsResult.carrier_id == carrier_id, SmsResult.snapshot_month == month)
                .order_by(SmsResult.id)
            )
        )

    # process_agents

    def sync_agents(
        self,
        carrier_id: int,
        agents: Sequence[tuple[ProcessAgent, int]],
        source: str,
        today: date,
    ) -> None:
        """(agent values, raw record id). Agents not in `agents` are marked not current."""
        existing = {
            (a.source_system, a.docket, a.name): a
            for a in self.db.scalars(
                select(ProcessAgent).where(ProcessAgent.carrier_id == carrier_id)
            )
        }
        seen = set()
        for values, raw_record_id in agents:
            key = (values.source_system, values.docket, values.name)
            seen.add(key)
            row = existing.get(key)
            if row is None:
                row = ProcessAgent(
                    carrier_id=carrier_id,
                    source_system=values.source_system,
                    docket=values.docket,
                    name=values.name,
                    first_seen=today,
                    source=source,
                )
            row.attention = values.attention
            row.city = values.city
            row.state = values.state
            row.last_seen = today
            row.is_current = True
            row.raw_record_id = raw_record_id
            self.db.add(row)
        for key, row in existing.items():
            if key not in seen:
                row.is_current = False
        self.db.flush()

    def current_agents(self, carrier_id: int) -> list[ProcessAgent]:
        return list(
            self.db.scalars(
                select(ProcessAgent)
                .where(ProcessAgent.carrier_id == carrier_id, ProcessAgent.is_current)
                .order_by(ProcessAgent.source_system.desc(), ProcessAgent.docket, ProcessAgent.name)
            )
        )
