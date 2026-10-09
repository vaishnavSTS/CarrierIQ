from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import SocrataClient
from app.ingestion.vpic import VpicClient
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_history_repository import CarrierHistoryRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.inspection_repository import InspectionRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.repositories.signal_repository import SignalRepository
from app.repositories.timeline_repository import TimelineRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.carrier_authority import CarrierAuthorityOut
from app.schemas.carrier_equipment import CarrierEquipmentOut
from app.schemas.carrier_profile import CarrierProfile
from app.schemas.carrier_safety import CarrierSafetyOut, InspectionPageOut
from app.schemas.carrier_search import CarrierSearchResponse
from app.schemas.carrier_signals import CarrierSignalsOut
from app.services.carrier_authority_service import CarrierAuthorityService
from app.services.carrier_equipment_service import CarrierEquipmentService, EquipmentReader
from app.services.carrier_profile_service import CarrierProfileService
from app.services.carrier_refresh_factory import build_refresh_service
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.carrier_safety_service import CarrierSafetyService
from app.services.carrier_search_service import CarrierSearchService
from app.services.carrier_signals_service import CarrierSignalsService

router = APIRouter(prefix="/carriers", tags=["carriers"])


def get_socrata_client() -> Iterator[SocrataClient]:
    client = SocrataClient()
    try:
        yield client
    finally:
        client.close()


def get_vpic_client() -> Iterator[VpicClient]:
    client = VpicClient()
    try:
        yield client
    finally:
        client.close()


def get_refresh_service(
    db: Annotated[Session, Depends(get_db)],
    client: Annotated[SocrataClient, Depends(get_socrata_client)],
    vpic: Annotated[VpicClient, Depends(get_vpic_client)],
) -> CarrierRefreshService:
    return build_refresh_service(db, client, vpic)


Refresh = Annotated[CarrierRefreshService, Depends(get_refresh_service)]


def get_carrier_search_service(
    db: Annotated[Session, Depends(get_db)],
    client: Annotated[SocrataClient, Depends(get_socrata_client)],
    refresh: Refresh,
) -> CarrierSearchService:
    settings = get_settings()
    return CarrierSearchService(
        CompanyCensusAdapter(client),
        refresh,
        CarrierRepository(db),
        AuthorityRepository(db),
        ObservedValueRepository(db),
        InsuranceRepository(db),
        SignalRepository(db),
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
    refresh: Refresh,
) -> CarrierProfileService:
    return CarrierProfileService(
        refresh,
        ObservedValueRepository(db),
        AuthorityRepository(db),
        InspectionRepository(db),
        CarrierHistoryRepository(db),
        InsuranceRepository(db),
        TimelineRepository(db),
        SignalRepository(db),
    )


# Declared after /search so "search" is never read as a USDOT number.
@router.get("/{usdot_number}", response_model=CarrierProfile)
def get_carrier_profile(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    service: Annotated[CarrierProfileService, Depends(get_carrier_profile_service)],
) -> CarrierProfile:
    return service.get(usdot_number)


def get_carrier_safety_service(
    db: Annotated[Session, Depends(get_db)],
    refresh: Refresh,
) -> CarrierSafetyService:
    return CarrierSafetyService(refresh, InspectionRepository(db))


UsdotPath = Annotated[int, Path(gt=0, lt=100_000_000)]


@router.get("/{usdot_number}/safety", response_model=CarrierSafetyOut)
def get_carrier_safety(
    usdot_number: UsdotPath,
    service: Annotated[CarrierSafetyService, Depends(get_carrier_safety_service)],
) -> CarrierSafetyOut:
    return service.safety(usdot_number)


@router.get("/{usdot_number}/inspections", response_model=InspectionPageOut)
def get_carrier_inspections(
    usdot_number: UsdotPath,
    service: Annotated[CarrierSafetyService, Depends(get_carrier_safety_service)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    oos_only: bool = False,
) -> InspectionPageOut:
    return service.inspection_page(usdot_number, page, page_size, oos_only)


def get_carrier_authority_service(
    db: Annotated[Session, Depends(get_db)],
    refresh: Refresh,
) -> CarrierAuthorityService:
    return CarrierAuthorityService(
        refresh,
        AuthorityRepository(db),
        InsuranceRepository(db),
        AuthorityHistoryRepository(db),
    )


@router.get("/{usdot_number}/authority", response_model=CarrierAuthorityOut)
def get_carrier_authority(
    usdot_number: UsdotPath,
    service: Annotated[CarrierAuthorityService, Depends(get_carrier_authority_service)],
) -> CarrierAuthorityOut:
    return service.get(usdot_number)


def get_carrier_equipment_service(
    db: Annotated[Session, Depends(get_db)],
    refresh: Refresh,
) -> CarrierEquipmentService:
    return CarrierEquipmentService(
        refresh,
        EquipmentReader(CarrierRepository(db), VehicleRepository(db), RelationshipRepository(db)),
    )


@router.get("/{usdot_number}/equipment", response_model=CarrierEquipmentOut)
def get_carrier_equipment(
    usdot_number: UsdotPath,
    service: Annotated[CarrierEquipmentService, Depends(get_carrier_equipment_service)],
) -> CarrierEquipmentOut:
    return service.get(usdot_number)


def get_carrier_signals_service(
    db: Annotated[Session, Depends(get_db)],
    refresh: Refresh,
) -> CarrierSignalsService:
    return CarrierSignalsService(refresh, SignalRepository(db))


@router.get("/{usdot_number}/signals", response_model=CarrierSignalsOut)
def get_carrier_signals(
    usdot_number: UsdotPath,
    service: Annotated[CarrierSignalsService, Depends(get_carrier_signals_service)],
) -> CarrierSignalsOut:
    return service.get(usdot_number)
