"""Health check logic: is the API up, and can it reach PostgreSQL?"""

import logging

from sqlalchemy.exc import SQLAlchemyError

from app.repositories.health_repository import HealthRepository
from app.schemas.health import ComponentStatus, HealthResponse

logger = logging.getLogger(__name__)


class HealthService:
    def __init__(self, repository: HealthRepository) -> None:
        self.repository = repository

    def check(self) -> HealthResponse:
        try:
            self.repository.ping()
            database = ComponentStatus.OK
        except SQLAlchemyError:
            logger.exception("Database health check failed")
            database = ComponentStatus.UNAVAILABLE

        overall = ComponentStatus.OK if database is ComponentStatus.OK else ComponentStatus.DEGRADED
        return HealthResponse(status=overall, database=database)
