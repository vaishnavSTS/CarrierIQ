"""Account logs: STS admins read every login, failed login, logout and account change, and what
each person searched and opened. Any logged-in person's carrier page reports the tabs they open."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_sts_admin
from app.db.session import get_db
from app.models import User
from app.schemas.account_log import AccountLogOut, CarrierViewIn, LogGroup
from app.services.account_log import AccountLog

router = APIRouter(prefix="/admin/account-log", tags=["admin"])
activity_router = APIRouter(prefix="/activity", tags=["activity"])


def get_account_log(db: Annotated[Session, Depends(get_db)]) -> AccountLog:
    return AccountLog(db)


Log = Annotated[AccountLog, Depends(get_account_log)]
StsAdmin = Annotated[User, Depends(require_sts_admin)]


@router.get("", response_model=AccountLogOut)
def account_log(
    _: StsAdmin,
    log: Log,
    user_id: Annotated[int | None, Query(gt=0)] = None,
    group: LogGroup = "all",
    q: Annotated[str | None, Query(max_length=100)] = None,
    before: Annotated[int | None, Query(gt=0)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> AccountLogOut:
    """Newest first. `user_id`: one account's history, with a summary (404 if no such account).
    `group`: logins (and logouts), failed logins, or account changes. `q`: email, name or IP
    contains it. `before`: the last id of the previous page."""
    return log.list(user_id=user_id, group=group, query=q, before=before, limit=limit)


@activity_router.post("/carrier-view", status_code=status.HTTP_204_NO_CONTENT)
def carrier_view(data: CarrierViewIn, request: Request, user: CurrentUser, log: Log) -> None:
    """The carrier page reports each tab the logged-in person opens, for their account history
    (the same tab again within 10 minutes counts once)."""
    log.viewed(user, data.usdot_number, data.tab, request)
