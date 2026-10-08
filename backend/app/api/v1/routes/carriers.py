from collections.abc import Iterator
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import SocrataClient
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_history_repository import CarrierHistoryRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.schemas.carrier_profile import CarrierProfile
from app.schemas.carrier_search import CarrierSearchResponse
from app.services.carrier_profile_service import CarrierProfileService
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.carrier_search_service import CarrierSearchService
from app.services.census_ingestion_service import build_census_ingestion_service
from app.services.inspection_ingestion_service import build_inspection_ingestion_service

router = APIRouter(prefix="/carriers", tags=["carriers"])


def get_socrata_client() -> Iterator[SocrataClient]:
    client = SocrataClient()
    try:
        yield client
    finally:
        client.close()


def build_refresh_service(db: Session, client: SocrataClient) -> CarrierRefreshService:
    return CarrierRefreshService(
        CarrierRepository(db),
        build_census_ingestion_service(db, client),
        build_inspection_ingestion_service(db, client),
        max_age=timedelta(hours=get_settings().carrier_refresh_hours),
    )


def get_carrier_search_service(
    db: Annotated[Session, Depends(get_db)],
    client: Annotated[SocrataClient, Depends(get_socrata_client)],
) -> CarrierSearchService:
    settings = get_settings()
    return CarrierSearchService(
        CompanyCensusAdapter(client),
        build_refresh_service(db, client),
        CarrierRepository(db),
        AuthorityRepository(db),
        ObservedValueRepository(db),
        name_limit=settings.search_result_limit,
        docket_limit=settings.docket_search_limit,
    )


@router.get("/search", response_model=CarrierSearchResponse)
def search_carriers(
    q: Annotated[str, Query(min_length=1, max_length=100, description="USDOT, MC/MX/FF or name")],
    service: Annotated[CarrierSearchService, Depends(get_carrier_search_service)],
) -> CarrierSearchResponse:
    return service.search(q)


def get_carrier_profile_service(
    db: Annotated[Session, Depends(get_db)],
    client: Annotated[SocrataClient, Depends(get_socrata_client)],
) -> CarrierProfileService:
    return CarrierProfileService(
        build_refresh_service(db, client),
        ObservedValueRepository(db),
        AuthorityRepository(db),
        InspectionRepository(db),
        CarrierHistoryRepository(db),
    )


# Declared after /search so "search" is never read as a USDOT number.
@router.get("/{usdot_number}", response_model=CarrierProfile)
def get_carrier_profile(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    service: Annotated[CarrierProfileService, Depends(get_carrier_profile_service)],
) -> CarrierProfile:
    return service.get(usdot_number)
