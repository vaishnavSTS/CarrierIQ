"""The account log: records logins, failed logins, logouts and account changes, and lists them for
STS admins (app/models/account_event.py)."""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, aliased

from app.api.bot_protection import client_ip
from app.core.exceptions import NotFoundError
from app.models import AccountEvent, AccountEventKind, Organization, User
from app.repositories.user_repository import UserRepository
from app.schemas.account_log import AccountEventOut, AccountLogOut, AccountSummaryOut, LogGroup

logger = logging.getLogger(__name__)

K = AccountEventKind
LOGIN_EVENTS = {K.LOGIN, K.LOGOUT}
GROUPS: dict[str, set[AccountEventKind]] = {
    "logins": LOGIN_EVENTS,
    "failed": {K.LOGIN_FAILED},
    "account": set(K) - LOGIN_EVENTS - {K.LOGIN_FAILED},
}
RECENT = timedelta(days=30)


class AccountLog:
    def __init__(self, db: Session) -> None:
        self.db = db

    def account(self, email: str) -> User | None:
        """The account a login try named, to file a failed try under it."""
        return UserRepository(self.db).by_email(email)

    def record(
        self,
        event: AccountEventKind,
        *,
        user: User | None = None,
        email: str | None = None,
        detail: str | None = None,
        actor: User | None = None,
        request: Request | None = None,
    ) -> None:
        """Adds a row and commits it. A row that can't be written is logged and skipped: the
        login or change it describes has already happened and must not fail because of it."""
        address = email or (user.email if user else None)
        row = AccountEvent(
            user_id=user.id if user else None,
            email=address.strip().lower()[:254] if address else None,
            event=event.value,
            detail=detail[:300] if detail else None,
            actor_id=actor.id if actor else None,
        )
        if request is not None:
            row.ip = client_ip(request)[:64]
            row.user_agent = (request.headers.get("user-agent") or "")[:400] or None
        try:
            self.db.add(row)
            self.db.commit()
        except SQLAlchemyError:
            self.db.rollback()
            logger.exception("Couldn't write the account log (%s)", event)

    def list(
        self,
        *,
        user_id: int | None = None,
        group: LogGroup = "all",
        query: str | None = None,
        before: int | None = None,
        limit: int = 100,
    ) -> AccountLogOut:
        """Newest first, `limit` at a time; `before` is the last id of the page before."""
        account = aliased(User)
        actor = aliased(User)
        stmt = (
            select(AccountEvent, account, actor)
            .outerjoin(account, account.id == AccountEvent.user_id)
            .outerjoin(actor, actor.id == AccountEvent.actor_id)
            .order_by(AccountEvent.id.desc())
            .limit(limit + 1)
        )
        summary = None
        if user_id is not None:
            summary = self.summary(user_id)
            stmt = stmt.where(AccountEvent.user_id == user_id)
        if group != "all":
            stmt = stmt.where(AccountEvent.event.in_([k.value for k in GROUPS[group]]))
        if before is not None:
            stmt = stmt.where(AccountEvent.id < before)
        q = (query or "").strip()
        if q:
            stmt = stmt.where(
                or_(
                    AccountEvent.email.icontains(q, autoescape=True),
                    account.email.icontains(q, autoescape=True),
                    account.full_name.icontains(q, autoescape=True),
                    AccountEvent.ip.icontains(q, autoescape=True),
                )
            )
        rows = self.db.execute(stmt).all()
        events = [
            AccountEventOut(
                id=event.id,
                at=event.created_at,
                event=event.event,
                detail=event.detail,
                user_id=event.user_id,
                account_name=who.full_name if who else None,
                account_email=who.email if who else event.email,
                actor_name=by.full_name if by else None,
                ip=event.ip,
                user_agent=event.user_agent,
            )
            for event, who, by in rows[:limit]
        ]
        return AccountLogOut(events=events, has_more=len(rows) > limit, account=summary)

    def summary(self, user_id: int) -> AccountSummaryOut:
        user = self.db.get(User, user_id)
        if user is None:
            raise NotFoundError(f"No account with id {user_id}")
        organization = self.db.get(Organization, user.organization_id)
        since = datetime.now(UTC) - RECENT

        def count(kind: AccountEventKind) -> int:
            found = self.db.scalar(
                select(func.count())
                .select_from(AccountEvent)
                .where(
                    AccountEvent.user_id == user_id,
                    AccountEvent.event == kind.value,
                    AccountEvent.created_at >= since,
                )
            )
            return found or 0

        last_failed = self.db.scalar(
            select(func.max(AccountEvent.created_at)).where(
                AccountEvent.user_id == user_id, AccountEvent.event == K.LOGIN_FAILED.value
            )
        )
        return AccountSummaryOut(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            organization_name=organization.name if organization else None,
            role=user.role,
            status=user.status,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            logins_30d=count(K.LOGIN),
            failed_logins_30d=count(K.LOGIN_FAILED),
            last_failed_login_at=last_failed,
        )
