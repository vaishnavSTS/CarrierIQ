"""Database access for timeline_events."""

from collections.abc import Sequence
from dataclasses import asdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TimelineEvent
from app.services.change_detection import TimelineEventValues


class TimelineRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_carrier(self, carrier_id: int) -> list[TimelineEvent]:
        """Newest first."""
        return list(
            self.db.scalars(
                select(TimelineEvent)
                .where(TimelineEvent.carrier_id == carrier_id)
                .order_by(TimelineEvent.event_date.desc(), TimelineEvent.id.desc())
            )
        )

    def sync(
        self,
        carrier_id: int,
        events: Sequence[TimelineEventValues],
        managed_prefixes: Sequence[str],
    ) -> tuple[int, int]:
        """Make the carrier's derived events with these type prefixes match `events`; returns
        (added, removed). Events another component produced are left alone, and so is an event
        an intelligence signal points at."""
        existing = {
            e.event_key: e
            for e in self.for_carrier(carrier_id)
            if e.event_key and e.event_type.startswith(tuple(managed_prefixes))
        }
        wanted = {e.event_key: e for e in events}
        added = removed = 0
        for key, values in wanted.items():
            row = existing.get(key)
            if row is None:
                self.db.add(TimelineEvent(carrier_id=carrier_id, **asdict(values)))
                added += 1
            else:
                for name, value in asdict(values).items():
                    setattr(row, name, value)
        for key, row in existing.items():
            if key not in wanted and row.signal_id is None:
                self.db.delete(row)
                removed += 1
        self.db.flush()
        return added, removed
