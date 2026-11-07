"""Admin Monitored DOTs: STS admins add the USDOT numbers they want to keep an eye on."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from sqlalchemy.orm import Session

from app.api.auth import require_sts_admin
from app.api.v1.routes.carriers import Refresh
from app.db.session import get_db
from app.models import User
from app.schemas.monitored import MonitoredCarrierIn, MonitoredCarrierOut
from app.services.monitored_carrier_service import MonitoredCarrierService

router = APIRouter(prefix="/admin/monitored", tags=["admin"])


def get_monitored_service(db: Annotated[Session, Depends(get_db)]) -> MonitoredCarrierService:
    return MonitoredCarrierService(db)


Service = Annotated[MonitoredCarrierService, Depends(get_monitored_service)]
StsAdmin = Annotated[User, Depends(require_sts_admin)]


@router.get("", response_model=list[MonitoredCarrierOut])
def list_monitored(_: StsAdmin, service: Service) -> list[MonitoredCarrierOut]:
    """Every monitored USDOT, newest first."""
    return service.list()


@router.post("", response_model=MonitoredCarrierOut, status_code=status.HTTP_201_CREATED)
def add_monitored(
    data: MonitoredCarrierIn, admin: StsAdmin, service: Service, refresh: Refresh
) -> MonitoredCarrierOut:
    """Monitor a USDOT number; it must be a carrier FMCSA knows (409 if already monitored)."""
    return service.add(data.usdot_number, admin, refresh)


@router.delete("/{usdot_number}", status_code=status.HTTP_204_NO_CONTENT)
def remove_monitored(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)], _: StsAdmin, service: Service
) -> None:
    """Stop monitoring a USDOT number."""
    service.remove(usdot_number)
