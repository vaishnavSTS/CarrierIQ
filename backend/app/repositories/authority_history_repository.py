"""Database access for authority_history. Rows are source facts: only ever inserted."""

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.operating_authority_normalizer import AuthorityEventValues
from app.models import AuthorityHistory


class AuthorityHistoryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_carrier(self, carrier_id: int) -> list[AuthorityHistory]:
        """Newest first; undated actions last."""
        return list(
            self.db.scalars(
                select(AuthorityHistory)
                .where(AuthorityHistory.carrier_id == carrier_id)
                .order_by(
                    AuthorityHistory.action_date.desc().nulls_last(), AuthorityHistory.id.desc()
                )
            )
        )

    def add_missing(
        self,
        carrier_id: int,
        events: Sequence[tuple[AuthorityEventValues, int]],
        *,
        source: str,
    ) -> int:
        """Insert events not stored yet (keyed by raw record + event kind); returns how many."""
        raw_ids = {raw_id for _, raw_id in events}
        stored = (
            set(
                self.db.execute(
                    select(AuthorityHistory.raw_record_id, AuthorityHistory.event_kind).where(
                        AuthorityHistory.raw_record_id.in_(raw_ids)
                    )
                ).tuples()
            )
            if raw_ids
            else set()
        )
        added = 0
        for event, raw_id in events:
            if (raw_id, event.event_kind) in stored:
                continue
            self.db.add(
                AuthorityHistory(
                    carrier_id=carrier_id,
                    docket_prefix=event.docket_prefix,
                    docket_number=event.docket_number,
                    authority_type=event.authority_type,
                    event_kind=event.event_kind,
                    action=event.action,
                    status=event.status,
                    reason=event.reason,
                    action_date=event.action_date,
                    source_system=event.source_system,
                    source=source,
                    raw_record_id=raw_id,
                )
            )
            stored.add((raw_id, event.event_kind))
            added += 1
        self.db.flush()
        return added
