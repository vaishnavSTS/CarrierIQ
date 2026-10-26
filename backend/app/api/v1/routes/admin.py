from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.api.auth import require_sts_admin
from app.db.session import get_db
from app.models import User
from app.models.enums import UserStatus
from app.repositories.user_repository import UserRepository
from app.schemas.auth import AddCarrierIn, AdminUserOut, SeenOut
from app.services.auth_service import AuthService

router = APIRouter(prefix="/admin", tags=["admin"])


def get_auth_service(db: Annotated[Session, Depends(get_db)]) -> AuthService:
    return AuthService(db, UserRepository(db))


Service = Annotated[AuthService, Depends(get_auth_service)]
StsAdmin = Annotated[User, Depends(require_sts_admin)]


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    _: StsAdmin, service: Service, status: UserStatus | None = None
) -> list[AdminUserOut]:
    """All accounts, newest first; `?status=PENDING` lists sign-ups waiting for approval."""
    return service.list_users(status)


@router.post("/users/seen", response_model=SeenOut)
def mark_new_accounts_seen(_: StsAdmin, service: Service) -> SeenOut:
    """Dismiss the "new sign-up" pop-up for every account in it."""
    return SeenOut(marked=service.mark_new_accounts_seen())


@router.post("/users/{user_id}/reactivate", response_model=AdminUserOut)
def reactivate_user(
    user_id: Annotated[int, Path(gt=0)], _: StsAdmin, service: Service
) -> AdminUserOut:
    """Let a disabled account log in again."""
    return service.reactivate(user_id)


@router.post("/users/{user_id}/disable", response_model=AdminUserOut)
def disable_user(
    user_id: Annotated[int, Path(gt=0)], admin: StsAdmin, service: Service
) -> AdminUserOut:
    return service.disable(user_id, admin)


@router.post("/users/{user_id}/carriers", response_model=AdminUserOut)
def add_carrier(
    user_id: Annotated[int, Path(gt=0)], data: AddCarrierIn, admin: StsAdmin, service: Service
) -> AdminUserOut:
    """Link a USDOT number to the client's organization, verified; it shows in their portal."""
    return service.add_carrier(user_id, data.usdot_number, admin)
