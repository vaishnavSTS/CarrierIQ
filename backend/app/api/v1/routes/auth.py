import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser
from app.core.config import get_settings
from app.core.exceptions import (
    AccountDisabledError,
    AccountPendingError,
    CarrierIQError,
    NotFoundError,
    UnauthorizedError,
)
from app.core.google_oauth import GoogleIdentity, GoogleOAuthClient
from app.core.security import create_purpose_token, create_session_token, read_purpose_token
from app.db.session import get_db
from app.models import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    AuthOptionsOut,
    GoogleSignupIn,
    GoogleSignupPendingOut,
    LoginIn,
    RegisterIn,
    RegisterOut,
    UserOut,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_STATE_COOKIE = "carrieriq_google_state"  # CSRF check for the Google round trip
GOOGLE_SIGNUP_COOKIE = "carrieriq_google_signup"  # a new Google user, until they finish signing up
GOOGLE_SIGNUP_PURPOSE = "google_signup"
GOOGLE_SIGNUP_MINUTES = 30


def get_auth_service(db: Annotated[Session, Depends(get_db)]) -> AuthService:
    return AuthService(db, UserRepository(db))


def get_google_client() -> GoogleOAuthClient:
    return GoogleOAuthClient()


Service = Annotated[AuthService, Depends(get_auth_service)]
Google = Annotated[GoogleOAuthClient, Depends(get_google_client)]


def _set_cookie(response: Response, name: str, value: str, max_age: int) -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        httponly=True,  # page scripts cannot read it
        secure=get_settings().auth_cookie_secure,
        samesite="lax",  # not sent on cross-site POSTs; sent on Google's redirect back (a GET)
        path="/",
    )


def _clear_cookie(response: Response, name: str) -> None:
    response.delete_cookie(
        name, path="/", httponly=True, secure=get_settings().auth_cookie_secure, samesite="lax"
    )


def _start_session(response: Response, user: User) -> None:
    settings = get_settings()
    _set_cookie(
        response,
        settings.auth_cookie_name,
        create_session_token(user.id),
        int(settings.auth_token_hours * 3600),
    )


@router.get("/options", response_model=AuthOptionsOut)
def options() -> AuthOptionsOut:
    """Which sign-in methods the login and sign-up pages should offer."""
    return AuthOptionsOut(google=get_settings().google_enabled)


@router.post("/register", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, service: Service) -> RegisterOut:
    """A client signs up. The account stays PENDING until an STS admin approves it."""
    return service.register(data)


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, response: Response, service: Service) -> UserOut:
    """Sets the session cookie. `portal` in the answer says which portal to open."""
    user = service.login(data)
    _start_session(response, user)
    return service.user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    _clear_cookie(response, get_settings().auth_cookie_name)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser, service: Service) -> UserOut:
    """The logged-in user; 401 when nobody is logged in."""
    return service.user_out(user)


# --- Continue with Google ------------------------------------------------------------------------
# The browser goes /auth/google/start → Google → /auth/google/callback, which ends on a frontend
# page: the portal (logged in), /register/google (new: finish signing up) or /login?google=...


@router.get("/google/start")
def google_start(google: Google) -> RedirectResponse:
    if not get_settings().google_enabled:
        raise NotFoundError("Google sign-in is not set up")
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(google.authorization_url(state), status_code=302)
    _set_cookie(response, GOOGLE_STATE_COOKIE, state, 600)
    return response


@router.get("/google/callback")
def google_callback(
    request: Request,
    google: Google,
    service: Service,
    code: str | None = None,
    state: str | None = None,
) -> RedirectResponse:
    expected = request.cookies.get(GOOGLE_STATE_COOKIE)
    if not code or not state or not expected or not secrets.compare_digest(state, expected):
        return _to_login("failed")  # cancelled on Google's page, or a forged / stale request
    try:
        identity = google.exchange(code)
        user = service.google_sign_in(identity)
    except AccountPendingError:
        return _to_login("pending")
    except AccountDisabledError:
        return _to_login("disabled")
    except CarrierIQError:
        return _to_login("failed")

    if user is None:
        response = RedirectResponse("/register/google", status_code=302)
        claims = {"google_sub": identity.sub, "email": identity.email, "name": identity.name}
        token = create_purpose_token(claims, GOOGLE_SIGNUP_PURPOSE, GOOGLE_SIGNUP_MINUTES)
        _set_cookie(response, GOOGLE_SIGNUP_COOKIE, token, GOOGLE_SIGNUP_MINUTES * 60)
    else:
        home = "/dashboard" if user.role.is_staff else "/portal"
        response = RedirectResponse(home, status_code=302)
        _start_session(response, user)
    _clear_cookie(response, GOOGLE_STATE_COOKIE)
    return response


def _to_login(reason: str) -> RedirectResponse:
    response = RedirectResponse(f"/login?google={reason}", status_code=302)
    _clear_cookie(response, GOOGLE_STATE_COOKIE)
    return response


def _pending_google_signup(request: Request) -> GoogleIdentity:
    token = request.cookies.get(GOOGLE_SIGNUP_COOKIE)
    claims = read_purpose_token(token, GOOGLE_SIGNUP_PURPOSE) if token else None
    if not claims:
        raise UnauthorizedError("Your Google sign-in has expired; continue with Google again")
    return GoogleIdentity(
        sub=claims["google_sub"], email=claims["email"], email_verified=True, name=claims["name"]
    )


@router.get("/google/signup", response_model=GoogleSignupPendingOut)
def google_signup_pending(request: Request) -> GoogleSignupPendingOut:
    """Who is finishing a Google sign-up (for the form); 401 when nobody is."""
    identity = _pending_google_signup(request)
    return GoogleSignupPendingOut(email=identity.email, full_name=identity.name)


@router.post("/google/signup", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
def google_signup_complete(
    data: GoogleSignupIn, request: Request, response: Response, service: Service
) -> RegisterOut:
    """Mobile number and USDOT for a new Google user; the account then waits for approval."""
    result = service.complete_google_signup(_pending_google_signup(request), data)
    _clear_cookie(response, GOOGLE_SIGNUP_COOKIE)
    return result
