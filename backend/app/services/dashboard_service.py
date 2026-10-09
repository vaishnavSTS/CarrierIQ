"""Totals and the newest signals for the dashboard (stored data only; nothing is fetched)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Carrier, Inspection, IntelligenceSignal, Vehicle
from app.models.enums import Severity, SignalStatus
from app.schemas.dashboard import DashboardOut, RecentSignalOut, TotalsOut

RECENT_SIGNALS = 12


class DashboardService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _count(self, model: type[Carrier] | type[Inspection] | type[Vehicle]) -> int:
        return self.db.scalar(select(func.count()).select_from(model)) or 0

    def overview(self) -> DashboardOut:
        open_rows = self.db.execute(
            select(IntelligenceSignal.severity, func.count())
            .where(
                IntelligenceSignal.is_active.is_(True),
                IntelligenceSignal.status == SignalStatus.OPEN,
                IntelligenceSignal.severity != Severity.INFO,
            )
            .group_by(IntelligenceSignal.severity)
        )
        by_severity = {s.value: 0 for s in (Severity.HIGH, Severity.MEDIUM, Severity.LOW)}
        for severity, n in open_rows:
            by_severity[severity.value] = n
        recent = self.db.execute(
            select(IntelligenceSignal, Carrier.usdot_number, Carrier.legal_name)
            .join(Carrier, Carrier.id == IntelligenceSignal.carrier_id)
            .where(
                IntelligenceSignal.is_active.is_(True),
                IntelligenceSignal.severity != Severity.INFO,
            )
            .order_by(
                IntelligenceSignal.first_detected_at.desc().nulls_last(),
                IntelligenceSignal.id.desc(),
            )
            .limit(RECENT_SIGNALS)
        )
        return DashboardOut(
            totals=TotalsOut(
                carriers=self._count(Carrier),
                inspections=self._count(Inspection),
                vehicles=self._count(Vehicle),
                open_signals=sum(by_severity.values()),
                open_by_severity=by_severity,
            ),
            recent_signals=[
                RecentSignalOut(
                    id=s.id,
                    usdot_number=usdot,
                    legal_name=name,
                    signal_type=s.signal_type,
                    severity=s.severity.value,
                    title=s.title,
                    detected_at=s.first_detected_at,
                )
                for s, usdot, name in recent
            ],
        )
