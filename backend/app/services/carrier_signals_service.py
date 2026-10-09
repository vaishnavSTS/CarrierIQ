"""A carrier's active intelligence signals with their evidence, refreshed on demand first."""

from app.core.exceptions import CarrierNotFoundError
from app.models.enums import Severity
from app.repositories.signal_repository import SignalRepository
from app.schemas.carrier_signals import CarrierSignalsOut, EvidenceOut, SignalOut
from app.services.carrier_refresh_service import CarrierRefreshService

_RANK = {Severity.HIGH: 0, Severity.MEDIUM: 1, Severity.LOW: 2, Severity.INFO: 3}


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
            signals=[
                SignalOut(
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
                        for e in evidence[s.id]
                    ],
                )
                for s in rows
            ],
        )
