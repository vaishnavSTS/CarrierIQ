from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser
from app.core.config import get_settings
from app.core.security import create_session_token
from app.db.session import get_db
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginIn, RegisterIn, RegisterOut, UserOut
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service(db: Annotated[Session, Depends(get_db)]) -> AuthService:
    return AuthService(db, UserRepository(db))


Service = Annotated[AuthService, Depends(get_auth_service)]


@router.post("/register", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, service: Service) -> RegisterOut:
    """A client signs up. The account stays PENDING until an STS admin approves it."""
    return service.register(data)


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, response: Response, service: Service) -> UserOut:
    """Sets the session cookie. `portal` in the answer says which portal to open."""
    user = service.login(data)
    settings = get_settings()
    response.set_cookie(
        settings.auth_cookie_name,
        create_session_token(user.id),
        max_age=int(settings.auth_token_hours * 3600),
        httponly=True,  # page scripts cannot read it
        secure=settings.auth_cookie_secure,
        samesite="lax",  # not sent on cross-site POSTs
        path="/",
    )
    return service.user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        settings.auth_cookie_name,
        path="/",
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, service: Service) -> UserOut:
    """The logged-in user; 401 when nobody is logged in."""
    return service.user_out(user)
