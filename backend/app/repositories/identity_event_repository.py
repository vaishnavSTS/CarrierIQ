"""Database access for identity_events (spec Sections 11.3, 29). Rows are never changed or
deleted: a correction is a new row pointing at the event it corrects."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import IdentityEvent


class IdentityEventRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_carrier(self, carrier_id: int) -> list[IdentityEvent]:
        """Oldest first, so corrections follow what they correct."""
        return list(
            self.db.scalars(
                select(IdentityEvent)
                .where(IdentityEvent.carrier_id == carrier_id)
                .order_by(IdentityEvent.event_date, IdentityEvent.id)
            )
        )

    def get(self, event_id: int) -> IdentityEvent | None:
        return self.db.get(IdentityEvent, event_id)

    def add(self, event: IdentityEvent) -> IdentityEvent:
        self.db.add(event)
        self.db.flush()
        return event
