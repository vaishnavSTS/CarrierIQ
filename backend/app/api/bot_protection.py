"""Bot protection for the login and sign-up routes: rate limits and the Turnstile check."""

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, Request

from app.core.config import get_settings
from app.core.exceptions import BotCheckFailedError, RateLimitedError
from app.core.rate_limit import limiter
from app.core.turnstile import TurnstileVerifier

LOGIN_PER_IP = (5, 60.0)  # attempts, seconds
SIGNUP_PER_IP = (10, 36000.0)
FAILED_LOGINS_PER_EMAIL = (3, 600.0)
FORGOT_PER_IP = (5, 3600.0)
RESET_EMAILS_PER_ADDRESS = (3, 3600.0)
RESET_PER_IP = (10, 3600.0)
RESEND_PER_IP = (5, 3600.0)
VERIFY_PER_IP = (10, 3600.0)


def client_ip(request: Request) -> str:
    """The visitor's address. The API is reached through Vercel's rewrite and Render's proxy, so
    the connection itself comes from them: every visitor would share one address. The first
    X-Forwarded-For entry is the visitor's (Vercel replaces whatever the visitor sends)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    return first or (request.client.host if request.client else "unknown")


def limit_login(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        limit, window = LOGIN_PER_IP
        limiter.hit(f"login-ip:{client_ip(request)}", limit, window)


def limit_signup(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        limit, window = SIGNUP_PER_IP
        limiter.hit(f"signup-ip:{client_ip(request)}", limit, window)


def limit_forgot_password(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        limit, window = FORGOT_PER_IP
        limiter.hit(f"forgot-ip:{client_ip(request)}", limit, window)


def limit_reset_password(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        limit, window = RESET_PER_IP
        limiter.hit(f"reset-ip:{client_ip(request)}", limit, window)


def limit_resend_verification(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        limit, window = RESEND_PER_IP
        limiter.hit(f"resend-ip:{client_ip(request)}", limit, window)


def limit_verify_email(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        limit, window = VERIFY_PER_IP
        limiter.hit(f"verify-ip:{client_ip(request)}", limit, window)


def may_email_link(kind: str, email: str) -> bool:
    """False once this address has had its share of these emails, so nobody can flood an inbox.
    The page's answer doesn't change, so it doesn't reveal the account either."""
    if not get_settings().rate_limit_enabled:
        return True
    limit, window = RESET_EMAILS_PER_ADDRESS
    try:
        limiter.hit(f"{kind}-email:{email}", limit, window)
    except RateLimitedError:
        return False
    return True


def check_failed_logins(email: str) -> None:
    """Too many wrong passwords for this account, from anywhere: refused for a while."""
    if get_settings().rate_limit_enabled:
        limit, window = FAILED_LOGINS_PER_EMAIL
        limiter.check(f"login-email:{email}", limit, window)


def record_failed_login(email: str) -> None:
    if get_settings().rate_limit_enabled:
        limiter.record(f"login-email:{email}", FAILED_LOGINS_PER_EMAIL[1])


def clear_failed_logins(email: str) -> None:
    limiter.clear(f"login-email:{email}")


@lru_cache
def get_turnstile_verifier() -> TurnstileVerifier:
    """How tokens are checked (tests replace it)."""
    return TurnstileVerifier()


def require_human(
    verifier: Annotated[TurnstileVerifier, Depends(get_turnstile_verifier)],
    token: Annotated[str | None, Header(alias="X-Turnstile-Token")] = None,
    trap: Annotated[str | None, Header(alias="X-Form-Trap")] = None,
) -> None:
    """The form's hidden honeypot field must be empty (people never see it) and its Turnstile token
    must check out (off until both Turnstile keys are set)."""
    if trap:
        raise BotCheckFailedError("The security check didn't pass. Please try it again.")
    if get_settings().turnstile_enabled and not (token and verifier.verify(token)):
        raise BotCheckFailedError("The security check didn't pass. Please try it again.")
