from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Path, Request, status
from sqlalchemy.orm import Session

from app.api.auth import require_sts_admin
from app.api.v1.routes.account_log import Log
from app.api.v1.routes.auth import Mailer
from app.db.session import get_db
from app.models import AccountEventKind, User
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
E = AccountEventKind


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
    data: StaffInviteIn,
    request: Request,
    admin: StsAdmin,
    service: Service,
    tasks: BackgroundTasks,
    mailer: Mailer,
    log: Log,
) -> AccountInviteOut:
    """Add an STS admin or analyst. They get an email with a link to choose their password."""
    user, token = service.invite_staff(data.email, data.full_name, UserRole(data.role))
    role = "STS admin" if user.role == UserRole.STS_ADMIN else "STS analyst"
    log.record(E.INVITED, user=user, detail=f"Added as {role}", actor=admin, request=request)
    return _invited(service, user, token, tasks, mailer)


@router.post("/clients", response_model=AccountInviteOut, status_code=status.HTTP_201_CREATED)
def invite_client(
    data: ClientInviteIn,
    request: Request,
    admin: StsAdmin,
    service: Service,
    tasks: BackgroundTasks,
    mailer: Mailer,
    log: Log,
) -> AccountInviteOut:
    """Add a carrier account, as a sign-up would make it, with its USDOT verified and claimed.
    They get an email with a link to choose their password; their trial starts when they do."""
    user, token = service.invite_client(data, admin)
    detail = f"Added as a carrier, USDOT {data.usdot_number}"
    log.record(E.INVITED, user=user, detail=detail, actor=admin, request=request)
    return _invited(service, user, token, tasks, mailer)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: Annotated[int, Path(gt=0)],
    request: Request,
    admin: StsAdmin,
    service: Service,
    log: Log,
) -> None:
    """Remove an account for good (and its company, if it was the only account). 409 when other
    records name it: disable it instead. Its account log stays, under its email."""
    target = service.users.get(user_id)
    email, name = (target.email, target.full_name) if target else (None, None)
    service.delete_account(user_id, admin)
    log.record(E.DELETED, email=email, detail=name, actor=admin, request=request)


@router.post("/users/{user_id}/reactivate", response_model=AdminUserOut)
def reactivate_user(
    user_id: Annotated[int, Path(gt=0)],
    request: Request,
    admin: StsAdmin,
    service: Service,
    log: Log,
) -> AdminUserOut:
    """Let a disabled account log in again."""
    out = service.reactivate(user_id)
    log.record(E.REACTIVATED, user=service.users.get(user_id), actor=admin, request=request)
    return out


@router.post("/users/{user_id}/disable", response_model=AdminUserOut)
def disable_user(
    user_id: Annotated[int, Path(gt=0)],
    request: Request,
    admin: StsAdmin,
    service: Service,
    log: Log,
) -> AdminUserOut:
    out = service.disable(user_id, admin)
    log.record(E.DISABLED, user=service.users.get(user_id), actor=admin, request=request)
    return out


@router.post("/users/{user_id}/carriers", response_model=AdminUserOut)
def add_carrier(
    user_id: Annotated[int, Path(gt=0)],
    data: AddCarrierIn,
    request: Request,
    admin: StsAdmin,
    service: Service,
    log: Log,
) -> AdminUserOut:
    """Link a USDOT number to the client's organization, verified; it shows in their portal."""
    out = service.add_carrier(user_id, data.usdot_number, admin)
    detail = f"USDOT {data.usdot_number}, verified"
    user = service.users.get(user_id)
    log.record(E.CARRIER_LINKED, user=user, detail=detail, actor=admin, request=request)
    return out


@router.post("/users/{user_id}/claims/{usdot_number}/release", response_model=AdminUserOut)
def release_claim(
    user_id: Annotated[int, Path(gt=0)],
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    request: Request,
    admin: StsAdmin,
    service: Service,
    log: Log,
) -> AdminUserOut:
    """Free a USDOT number this account claimed, so another carrier can sign up with it."""
    out = service.release_claim(user_id, usdot_number)
    user = service.users.get(user_id)
    detail = f"USDOT {usdot_number}"
    log.record(E.CLAIM_RELEASED, user=user, detail=detail, actor=admin, request=request)
    return out
