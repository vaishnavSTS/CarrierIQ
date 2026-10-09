"""A carrier's active intelligence signals with their evidence, and reviewers' decisions on them."""

from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import CarrierNotFoundError, NotFoundError
from app.models import IntelligenceSignal, SignalEvidence
from app.models.enums import Severity, SignalStatus
from app.repositories.signal_repository import SignalRepository
from app.schemas.carrier_signals import CarrierSignalsOut, EvidenceOut, SignalOut, SignalReviewIn
from app.services.carrier_refresh_service import CarrierRefreshService

_RANK = {Severity.HIGH: 0, Severity.MEDIUM: 1, Severity.LOW: 2, Severity.INFO: 3}


class SignalNotFoundError(NotFoundError):
    code = "signal_not_found"


class CarrierSignalsService:
    def __init__(self, refresh: CarrierRefreshService, signals: SignalRepository) -> None:
        self.refresh = refresh
        self.signals = signals

    def get(self, usdot_number: int) -> CarrierSignalsOut:
        carrier = self.refresh.ensure_fresh(usdot_number).carrier
        if carrier is None:
            raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number}")
        rows = sorted(
            self.signals.for_carrier(carrier.id),
            key=lambda s: (_RANK[s.severity], -(s.last_detected_at or s.created_at).timestamp()),
        )
        evidence = self.signals.evidence_for([s.id for s in rows])
        return CarrierSignalsOut(
            usdot_number=usdot_number,
            signals=[signal_out(s, evidence[s.id]) for s in rows],
        )


class SignalReviewService:
    """Record a reviewer's decision. The rules never touch it, so it survives every refresh."""

    def __init__(
        self,
        db: Session,
        signals: SignalRepository,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.db = db
        self.signals = signals
        self.now = now

    def review(self, signal_id: int, decision: SignalReviewIn) -> SignalOut:
        signal = self.db.get(IntelligenceSignal, signal_id)
        if signal is None:
            raise SignalNotFoundError(f"No signal with id {signal_id}")
        signal.status = SignalStatus(decision.status)
        if signal.status == SignalStatus.OPEN:
            signal.reviewed_at = None
            signal.review_note = None
        else:
            signal.reviewed_at = self.now()
            signal.review_note = (decision.note or "").strip() or None
        self.db.commit()
        return signal_out(signal, self.signals.evidence_for([signal.id])[signal.id])


def signal_out(s: IntelligenceSignal, evidence: list[SignalEvidence]) -> SignalOut:
    return SignalOut(
        id=s.id,
        signal_type=s.signal_type,
        rule_id=s.rule_id,
        rule_version=s.rule_version,
        severity=s.severity.value,
        confidence=s.confidence.value,
        status=s.status.value,
        title=s.title,
        description=s.description,
        first_detected_at=s.first_detected_at,
        last_detected_at=s.last_detected_at,
        reviewed_at=s.reviewed_at,
        review_note=s.review_note,
        evidence=[
            EvidenceOut(
                evidence_type=e.evidence_type,
                entity_type=e.entity_type,
                entity_id=e.entity_id,
                raw_record_id=e.raw_record_id,
                field_name=e.field_name,
                observed_value=e.observed_value,
                observed_at=e.observed_at,
                source=e.source,
            )
            for e in evidence
        ],
    )
