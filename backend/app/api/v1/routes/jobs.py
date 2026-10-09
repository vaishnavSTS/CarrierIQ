from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.jobs.queue import PostgresJobQueue
from app.models.enums import JobStatus
from app.repositories.job_repository import JobRepository
from app.schemas.jobs import JobOut, JobsOverviewOut
from app.services.job_status_service import JobStatusService

router = APIRouter(prefix="/jobs", tags=["jobs"])


def get_job_status_service(db: Annotated[Session, Depends(get_db)]) -> JobStatusService:
    return JobStatusService(db, JobRepository(db), PostgresJobQueue(db))


@router.get("", response_model=JobsOverviewOut)
def list_jobs(
    service: Annotated[JobStatusService, Depends(get_job_status_service)],
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
    status: JobStatus | None = None,
) -> JobsOverviewOut:
    """Counts by status, whether a worker is running, and the most recent jobs."""
    return service.overview(limit, status)


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: Annotated[int, Path(gt=0)],
    service: Annotated[JobStatusService, Depends(get_job_status_service)],
) -> JobOut:
    return service.get(job_id)
