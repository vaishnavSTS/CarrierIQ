"""Database access for ingestion_runs."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models import IngestionRun
from app.models.enums import IngestionStatus


class IngestionRunRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def start(self, source: str, dataset_id: str, query: str) -> IngestionRun:
        run = IngestionRun(source=source, dataset_id=dataset_id, query=query)
        self.db.add(run)
        self.db.flush()
        return run

    def succeed(self, run: IngestionRun, records_fetched: int) -> None:
        run.status = IngestionStatus.SUCCEEDED
        run.records_fetched = records_fetched
        run.finished_at = datetime.now(UTC)
        self.db.flush()

    def fail(self, run: IngestionRun, error_message: str) -> None:
        run.status = IngestionStatus.FAILED
        run.error_message = error_message
        run.finished_at = datetime.now(UTC)
        self.db.flush()
