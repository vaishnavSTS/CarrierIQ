"""Client portal. Carrier routes mirror /carriers/{usdot}/... but only for the client's own
verified carriers (require_own_carrier) and without STS-internal data (services/client_view.py).
Staff-only carrier routes (search, signals, refresh, team notes) have no client version."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.auth import require_client, require_own_carrier
from app.api.v1.routes.carriers import (
    get_carrier_authority_service,
    get_carrier_equipment_service,
    get_carrier_profile_service,
    get_carrier_safety_service,
    get_network_service,
)
from app.db.session import get_db
from app.models import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import PortalOverviewOut
from app.schemas.carrier_authority import CarrierAuthorityOut
from app.schemas.carrier_equipment import CarrierEquipmentOut
from app.schemas.carrier_profile import CarrierProfile
from app.schemas.carrier_safety import CarrierSafetyOut, InspectionPageOut
from app.schemas.network import NetworkOut
from app.services.auth_service import AuthService
from app.services.carrier_authority_service import CarrierAuthorityService
from app.services.carrier_equipment_service import CarrierEquipmentService
from app.services.carrier_profile_service import CarrierProfileService
from app.services.carrier_safety_service import CarrierSafetyService
from app.services.client_view import client_network, client_profile, client_safety
from app.services.network_service import NetworkService

router = APIRouter(prefix="/portal", tags=["portal"])

OwnCarrier = Annotated[int, Depends(require_own_carrier)]


def get_auth_service(db: Annotated[Session, Depends(get_db)]) -> AuthService:
    return AuthService(db, UserRepository(db))


@router.get("/overview", response_model=PortalOverviewOut)
def overview(
    user: Annotated[User, Depends(require_client)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> PortalOverviewOut:
    """The client's organization and the carriers STS has verified for it."""
    return service.portal_overview(user)


@router.get("/carriers/{usdot_number}", response_model=CarrierProfile)
def carrier_profile(
    usdot_number: OwnCarrier,
    service: Annotated[CarrierProfileService, Depends(get_carrier_profile_service)],
) -> CarrierProfile:
    return client_profile(service.get(usdot_number))


@router.get("/carriers/{usdot_number}/safety", response_model=CarrierSafetyOut)
def carrier_safety(
    usdot_number: OwnCarrier,
    service: Annotated[CarrierSafetyService, Depends(get_carrier_safety_service)],
) -> CarrierSafetyOut:
    return client_safety(service.safety(usdot_number))


@router.get("/carriers/{usdot_number}/inspections", response_model=InspectionPageOut)
def carrier_inspections(
    usdot_number: OwnCarrier,
    service: Annotated[CarrierSafetyService, Depends(get_carrier_safety_service)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    oos_only: bool = False,
) -> InspectionPageOut:
    return service.inspection_page(usdot_number, page, page_size, oos_only)


@router.get("/carriers/{usdot_number}/authority", response_model=CarrierAuthorityOut)
def carrier_authority(
    usdot_number: OwnCarrier,
    service: Annotated[CarrierAuthorityService, Depends(get_carrier_authority_service)],
) -> CarrierAuthorityOut:
    return service.get(usdot_number)


@router.get("/carriers/{usdot_number}/equipment", response_model=CarrierEquipmentOut)
def carrier_equipment(
    usdot_number: OwnCarrier,
    service: Annotated[CarrierEquipmentService, Depends(get_carrier_equipment_service)],
) -> CarrierEquipmentOut:
    return service.get(usdot_number)


@router.get("/carriers/{usdot_number}/network", response_model=NetworkOut)
def carrier_network(
    usdot_number: OwnCarrier,
    service: Annotated[NetworkService, Depends(get_network_service)],
) -> NetworkOut:
    """Registration checks and linked carriers; no STS team notes or ownership attestations."""
    return client_network(service.get(usdot_number))
