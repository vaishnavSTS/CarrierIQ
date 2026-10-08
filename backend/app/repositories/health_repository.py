"""Database access for health checks."""

from sqlalchemy import text
from sqlalchemy.orm import Session


class HealthRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def ping(self) -> None:
        """Raises if the database cannot be reached."""
        self.db.execute(text("SELECT 1"))
