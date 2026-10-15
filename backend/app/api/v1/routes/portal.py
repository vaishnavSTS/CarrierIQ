"""Client and broker portals. Carrier routes mirror /carriers/{usdot}/... without STS-internal
data (services/client_view.py), for any carrier: clients see their own carriers first and can look
up others (e.g. a carrier they work with), brokers vet carriers before giving them loads. Staff-only
carrier routes (signals, refresh, team notes) have no portal version."""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.api.auth import require_broker, require_client
from app.api.v1.routes.carriers import (
    get_carrier_authority_service,
    get_carrier_equipment_service,
    get_carrier_profile_service,
    get_carrier_safety_service,
    get_carrier_search_service,
    get_network_service,
)
from app.db.session import get_db
from app.models import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import BrokerOut, PortalOverviewOut
from app.schemas.carrier_authority import CarrierAuthorityOut
from app.schemas.carrier_equipment import CarrierEquipmentOut
from app.schemas.carrier_profile import CarrierProfile
from app.schemas.carrier_safety import CarrierSafetyOut, InspectionPageOut
from app.schemas.carrier_search import CarrierSearchResponse
from app.schemas.network import NetworkOut
from app.services.auth_service import AuthService
from app.services.carrier_authority_service import CarrierAuthorityService
from app.services.carrier_equipment_service import CarrierEquipmentService
from app.services.carrier_profile_service import CarrierProfileService
from app.services.carrier_safety_service import CarrierSafetyService
from app.services.carrier_search_service import CarrierSearchService
from app.services.client_view import client_network, client_profile, client_safety, client_search
from app.services.network_service import NetworkService

router = APIRouter(prefix="/portal", tags=["portal"])
broker_router = APIRouter(prefix="/broker", tags=["broker"])


def get_auth_service(db: Annotated[Session, Depends(get_db)]) -> AuthService:
    return AuthService(db, UserRepository(db))


def any_carrier(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    _: Annotated[User, Depends(require_broker)],
) -> int:
    """Brokers may open any USDOT number."""
    return usdot_number


def client_any_carrier(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    _: Annotated[User, Depends(require_client)],
) -> int:
    """Clients may open any USDOT number too; their own carriers are listed on their home page."""
    return usdot_number


def _add_carrier_routes(router: APIRouter, resolve: Callable[..., int]) -> None:
    """The client view of a carrier's tabs; `resolve` checks the USDOT (and who may open it)."""

    @router.get("/carriers/{usdot_number}", response_model=CarrierProfile)
    def carrier_profile(
        usdot_number: Annotated[int, Depends(resolve)],
        service: Annotated[CarrierProfileService, Depends(get_carrier_profile_service)],
    ) -> CarrierProfile:
        return client_profile(service.get(usdot_number))

    @router.get("/carriers/{usdot_number}/safety", response_model=CarrierSafetyOut)
    def carrier_safety(
        usdot_number: Annotated[int, Depends(resolve)],
        service: Annotated[CarrierSafetyService, Depends(get_carrier_safety_service)],
    ) -> CarrierSafetyOut:
        return client_safety(service.safety(usdot_number))

    @router.get("/carriers/{usdot_number}/inspections", response_model=InspectionPageOut)
    def carrier_inspections(
        usdot_number: Annotated[int, Depends(resolve)],
        service: Annotated[CarrierSafetyService, Depends(get_carrier_safety_service)],
        page: Annotated[int, Query(ge=1)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 25,
        oos_only: bool = False,
    ) -> InspectionPageOut:
        return service.inspection_page(usdot_number, page, page_size, oos_only)

    @router.get("/carriers/{usdot_number}/authority", response_model=CarrierAuthorityOut)
    def carrier_authority(
        usdot_number: Annotated[int, Depends(resolve)],
        service: Annotated[CarrierAuthorityService, Depends(get_carrier_authority_service)],
    ) -> CarrierAuthorityOut:
        return service.get(usdot_number)

    @router.get("/carriers/{usdot_number}/equipment", response_model=CarrierEquipmentOut)
    def carrier_equipment(
        usdot_number: Annotated[int, Depends(resolve)],
        service: Annotated[CarrierEquipmentService, Depends(get_carrier_equipment_service)],
    ) -> CarrierEquipmentOut:
        return service.get(usdot_number)

    @router.get("/carriers/{usdot_number}/network", response_model=NetworkOut)
    def carrier_network(
        usdot_number: Annotated[int, Depends(resolve)],
        service: Annotated[NetworkService, Depends(get_network_service)],
    ) -> NetworkOut:
        """Registration checks and linked carriers; no STS team notes or ownership attestations."""
        return client_network(service.get(usdot_number))


# --- Client portal -------------------------------------------------------------------------------


@router.get("/overview", response_model=PortalOverviewOut)
def overview(
    user: Annotated[User, Depends(require_client)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> PortalOverviewOut:
    """The client's organization and the carriers STS has verified for it."""
    return service.portal_overview(user)


@router.get("/search", response_model=CarrierSearchResponse)
def client_carrier_search(
    q: Annotated[str, Query(min_length=1, max_length=100, description="USDOT, MC/MX/FF or name")],
    _: Annotated[User, Depends(require_client)],
    service: Annotated[CarrierSearchService, Depends(get_carrier_search_service)],
) -> CarrierSearchResponse:
    """Carrier search, without STS review status or signal counts."""
    return client_search(service.search(q))


_add_carrier_routes(router, client_any_carrier)


# --- Broker portal -------------------------------------------------------------------------------


@broker_router.get("/overview", response_model=BrokerOut)
def broker_overview(
    user: Annotated[User, Depends(require_broker)],
    service: Annotated[AuthService, Depends(get_auth_service)],
) -> BrokerOut:
    """The broker's brokerage, as FMCSA confirmed it at sign-up."""
    return service.broker_overview(user)


@broker_router.get("/search", response_model=CarrierSearchResponse)
def broker_search(
    q: Annotated[str, Query(min_length=1, max_length=100, description="USDOT, MC/MX/FF or name")],
    _: Annotated[User, Depends(require_broker)],
    service: Annotated[CarrierSearchService, Depends(get_carrier_search_service)],
) -> CarrierSearchResponse:
    """Carrier search, without STS review status or signal counts."""
    return client_search(service.search(q))


_add_carrier_routes(broker_router, any_carrier)
