from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Path, status
from sqlalchemy.orm import Session

from app.api.auth import require_sts_admin
from app.api.v1.routes.auth import Mailer
from app.db.session import get_db
from app.models import User
from app.models.enums import UserRole, UserStatus
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AccountInviteOut,
    AddCarrierIn,
    AdminUserOut,
    ClientInviteIn,
    SeenOut,
    StaffInviteIn,
)
from app.services.auth_service import ACCOUNT_INVITE_HOURS, AuthService
from app.services.dataqs_email import EmailSender
from app.services.password_reset_email import account_invite_email, send_password_reset

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


def _invited(
    service: AuthService,
    user: User,
    token: str,
    tasks: BackgroundTasks,
    mailer: EmailSender | None,
) -> AccountInviteOut:
    """Email the new account its "choose your password" link (after answering)."""
    if mailer is not None:
        email = account_invite_email(user, token, ACCOUNT_INVITE_HOURS)
        tasks.add_task(send_password_reset, email, mailer)
    return AccountInviteOut(account=service.admin_out(user), invite_emailed=mailer is not None)


@router.post("/staff", response_model=AccountInviteOut, status_code=status.HTTP_201_CREATED)
def invite_staff(
    data: StaffInviteIn, _: StsAdmin, service: Service, tasks: BackgroundTasks, mailer: Mailer
) -> AccountInviteOut:
    """Add an STS admin or analyst. They get an email with a link to choose their password."""
    user, token = service.invite_staff(data.email, data.full_name, UserRole(data.role))
    return _invited(service, user, token, tasks, mailer)


@router.post("/clients", response_model=AccountInviteOut, status_code=status.HTTP_201_CREATED)
def invite_client(
    data: ClientInviteIn, admin: StsAdmin, service: Service, tasks: BackgroundTasks, mailer: Mailer
) -> AccountInviteOut:
    """Add a carrier account, as a sign-up would make it, with its USDOT verified and claimed.
    They get an email with a link to choose their password; their trial starts when they do."""
    user, token = service.invite_client(data, admin)
    return _invited(service, user, token, tasks, mailer)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: Annotated[int, Path(gt=0)], admin: StsAdmin, service: Service) -> None:
    """Remove an account for good (and its company, if it was the only account). 409 when other
    records name it: disable it instead."""
    service.delete_account(user_id, admin)


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


@router.post("/users/{user_id}/claims/{usdot_number}/release", response_model=AdminUserOut)
def release_claim(
    user_id: Annotated[int, Path(gt=0)],
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    _: StsAdmin,
    service: Service,
) -> AdminUserOut:
    """Free a USDOT number this account claimed, so another carrier can sign up with it."""
    return service.release_claim(user_id, usdot_number)
