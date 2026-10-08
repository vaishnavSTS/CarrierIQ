from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.health_repository import HealthRepository
from app.schemas.health import ComponentStatus, HealthResponse
from app.services.health_service import HealthService

router = APIRouter(tags=["health"])


def get_health_service(db: Annotated[Session, Depends(get_db)]) -> HealthService:
    return HealthService(HealthRepository(db))


@router.get("/health", response_model=HealthResponse)
def health(
    response: Response,
    service: Annotated[HealthService, Depends(get_health_service)],
) -> HealthResponse:
    result = service.check()
    if result.status is not ComponentStatus.OK:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return result
