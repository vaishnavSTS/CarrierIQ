"""Database access for intelligence_signals and signal_evidence."""

from collections.abc import Sequence
from dataclasses import asdict
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.intelligence.base_rule import SignalValues
from app.models import IntelligenceSignal, SignalEvidence


class SignalRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_carrier(self, carrier_id: int, *, active_only: bool = True) -> list[IntelligenceSignal]:
        query = select(IntelligenceSignal).where(IntelligenceSignal.carrier_id == carrier_id)
        if active_only:
            query = query.where(IntelligenceSignal.is_active.is_(True))
        return list(self.db.scalars(query.order_by(IntelligenceSignal.id)))

    def evidence_for(self, signal_ids: Sequence[int]) -> dict[int, list[SignalEvidence]]:
        found: dict[int, list[SignalEvidence]] = {i: [] for i in signal_ids}
        if not signal_ids:
            return found
        for row in self.db.scalars(
            select(SignalEvidence)
            .where(SignalEvidence.signal_id.in_(signal_ids))
            .order_by(SignalEvidence.id)
        ):
            found[row.signal_id].append(row)
        return found

    def sync(
        self,
        carrier_id: int,
        rule_id: str,
        rule_version: str,
        signals: Sequence[SignalValues],
        now: datetime,
    ) -> tuple[int, int]:
        """Make the rule's active signals for the carrier match `signals`; returns (new, ended).

        Callers must have checked every signal has evidence. A signal seen again keeps its id,
        first detection time and review status; its evidence is replaced with the current one.
        """
        existing = {
            s.signal_key: s
            for s in self.for_carrier(carrier_id, active_only=False)
            if s.rule_id == rule_id
        }
        wanted = {s.signal_key: s for s in signals}
        new = ended = 0
        rows: list[tuple[IntelligenceSignal, SignalValues]] = []
        for key, values in wanted.items():
            row = existing.get(key)
            if row is None:
                row = IntelligenceSignal(
                    carrier_id=carrier_id, signal_key=key, first_detected_at=now
                )
                self.db.add(row)
                new += 1
            row.signal_type = values.signal_type
            row.rule_id = rule_id
            row.rule_version = rule_version
            row.severity = values.severity
            row.confidence = values.confidence
            row.title = values.title
            row.description = values.description
            row.is_active = True
            row.last_detected_at = now
            rows.append((row, values))
        for old_key, row in existing.items():
            if old_key not in wanted and row.is_active:
                row.is_active = False
                ended += 1
        self.db.flush()  # ids for new signals

        if rows:
            self.db.execute(
                delete(SignalEvidence).where(SignalEvidence.signal_id.in_([r.id for r, _ in rows]))
            )
            self.db.add_all(
                SignalEvidence(signal_id=row.id, **asdict(evidence))
                for row, values in rows
                for evidence in values.evidence
            )
        self.db.flush()
        return new, ended
