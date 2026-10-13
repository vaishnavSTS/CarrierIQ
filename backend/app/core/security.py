"""Password hashing and session tokens. Pure functions; no database access.

Passwords: scrypt from Python's standard library (memory-hard, per-password random salt),
stored as "scrypt$n$r$p$salt$hash" so the cost can be raised later without breaking old hashes.
Sessions: a short-lived HS256 JWT carrying the user id, kept in an HttpOnly cookie so page
scripts can never read it.
"""

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import get_settings

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_TOKEN_ALGORITHM = "HS256"


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.b64decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=32,
        )
    except ValueError:
        return False
    return hmac.compare_digest(digest, base64.b64decode(expected))


def create_session_token(user_id: int, now: datetime | None = None) -> str:
    settings = get_settings()
    issued = now or datetime.now(UTC)
    claims = {
        "sub": str(user_id),
        "iat": issued,
        "exp": issued + timedelta(hours=settings.auth_token_hours),
    }
    return jwt.encode(claims, settings.auth_secret_key, algorithm=_TOKEN_ALGORITHM)


def read_session_token(token: str) -> int | None:
    """The user id in a valid, unexpired token; None for anything else."""
    try:
        claims = jwt.decode(token, get_settings().auth_secret_key, algorithms=[_TOKEN_ALGORITHM])
        if "purpose" in claims:  # a one-step token (create_purpose_token) is never a session
            return None
        return int(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def create_purpose_token(claims: dict[str, str], purpose: str, minutes: int) -> str:
    """A short-lived signed token for one step, e.g. carrying a Google identity from the
    callback to the "finish signing up" form. `purpose` stops it being used as a session."""
    now = datetime.now(UTC)
    payload = {**claims, "purpose": purpose, "iat": now, "exp": now + timedelta(minutes=minutes)}
    return jwt.encode(payload, get_settings().auth_secret_key, algorithm=_TOKEN_ALGORITHM)


def read_purpose_token(token: str, purpose: str) -> dict[str, str] | None:
    try:
        claims = jwt.decode(token, get_settings().auth_secret_key, algorithms=[_TOKEN_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if claims.get("purpose") != purpose:
        return None
    return {k: str(v) for k, v in claims.items() if k not in ("purpose", "iat", "exp")}
