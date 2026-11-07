"""Admin Monitored DOTs: the USDOT numbers STS admins monitor, newest first.

Adding a number loads the carrier from FMCSA (as a search would), so the list shows its company
name and its Safety Score Report opens straight away. A number FMCSA doesn't know is refused.
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models import Carrier, MonitoredCarrier, User
from app.schemas.monitored import MonitoredCarrierOut
from app.services.carrier_refresh_service import CarrierRefreshService


class MonitoredCarrierService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self) -> list[MonitoredCarrierOut]:
        rows = self.db.execute(
            select(MonitoredCarrier, Carrier.legal_name, Carrier.dba_name, User.full_name)
            .outerjoin(Carrier, Carrier.usdot_number == MonitoredCarrier.usdot_number)
            .outerjoin(User, User.id == MonitoredCarrier.added_by_id)
            .order_by(MonitoredCarrier.created_at.desc(), MonitoredCarrier.id.desc())
        ).all()
        return [
            MonitoredCarrierOut(
                usdot_number=row.usdot_number,
                legal_name=legal_name,
                dba_name=dba_name,
                added_at=row.created_at,
                added_by=added_by,
            )
            for row, legal_name, dba_name, added_by in rows
        ]

    def add(
        self, usdot_number: int, admin: User, refresh: CarrierRefreshService
    ) -> MonitoredCarrierOut:
        if self._get(usdot_number) is not None:
            raise ConflictError(f"USDOT {usdot_number} is already monitored")
        carrier = refresh.ensure_fresh(usdot_number).carrier
        if carrier is None:
            raise NotFoundError(f"No carrier with USDOT {usdot_number} in FMCSA data")
        row = MonitoredCarrier(usdot_number=usdot_number, added_by_id=admin.id)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return MonitoredCarrierOut(
            usdot_number=usdot_number,
            legal_name=carrier.legal_name,
            dba_name=carrier.dba_name,
            added_at=row.created_at,
            added_by=admin.full_name,
        )

    def remove(self, usdot_number: int) -> None:
        if self._get(usdot_number) is None:
            raise NotFoundError(f"USDOT {usdot_number} is not monitored")
        self.db.execute(
            delete(MonitoredCarrier).where(MonitoredCarrier.usdot_number == usdot_number)
        )
        self.db.commit()

    def _get(self, usdot_number: int) -> MonitoredCarrier | None:
        return self.db.scalar(
            select(MonitoredCarrier).where(MonitoredCarrier.usdot_number == usdot_number)
        )
