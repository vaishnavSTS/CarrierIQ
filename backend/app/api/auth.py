"""Who is calling: FastAPI dependencies that read the session cookie and enforce the portal.

Every route except health and the public auth routes depends on one of these (wired per router
in app/api/v1/router.py), so hiding a page in the frontend is never the only protection.
"""

from typing import Annotated

from fastapi import Depends, Path, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import CarrierNotFoundError, ForbiddenError, UnauthorizedError
from app.core.security import read_session_token
from app.db.session import get_db
from app.models import User
from app.models.enums import UserRole, UserStatus
from app.repositories.user_repository import UserRepository


def get_current_user(request: Request, db: Annotated[Session, Depends(get_db)]) -> User:
    token = request.cookies.get(get_settings().auth_cookie_name)
    user_id = read_session_token(token) if token else None
    user = UserRepository(db).get(user_id) if user_id is not None else None
    # An account disabled after logging in loses access on its next request.
    if user is None or user.status != UserStatus.ACTIVE:
        raise UnauthorizedError("Log in to continue")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_staff(user: CurrentUser) -> User:
    """Internal portal: STS admins and analysts."""
    if not user.role.is_staff:
        raise ForbiddenError("This area is for STS staff")
    return user


def require_sts_admin(user: CurrentUser) -> User:
    if user.role != UserRole.STS_ADMIN:
        raise ForbiddenError("Only an STS admin can do this")
    return user


def require_client(user: CurrentUser) -> User:
    """Client portal: users of a client organization."""
    if user.role.is_staff:
        raise ForbiddenError("This area is for STS clients")
    return user


ClientUser = Annotated[User, Depends(require_client)]


def require_own_carrier(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    user: ClientUser,
    db: Annotated[Session, Depends(get_db)],
) -> int:
    """A client may open only the USDOT numbers STS verified for their organization. Any other
    number answers 404, so the portal never confirms whether a carrier exists."""
    verified = UserRepository(db).organization_carriers(user.organization_id, verified_only=True)
    if usdot_number not in {link.usdot_number for link in verified}:
        raise CarrierNotFoundError(f"USDOT {usdot_number} is not one of your carriers")
    return usdot_number
