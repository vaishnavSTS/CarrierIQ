"""Google sign-in: OAuth 2.0 authorization-code flow with OpenID Connect.

The ID token comes straight from Google's token endpoint over HTTPS in exchange for the one-time
code, so (per OpenID Connect Core 3.1.3.7) TLS authenticates it and its signature need not be
checked again here. Its issuer, audience and expiry still are.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx
import jwt

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str  # Google's stable account id; an email address can change, this cannot
    email: str
    email_verified: bool
    name: str


class GoogleOAuthClient:
    def __init__(self, http: httpx.Client | None = None) -> None:
        settings = get_settings()
        self.client_id = settings.google_client_id or ""
        self.client_secret = settings.google_client_secret or ""
        self.redirect_uri = settings.google_redirect_uri
        self.http = http or httpx.Client(timeout=15.0)

    def authorization_url(self, state: str) -> str:
        query = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
        return f"{AUTH_URL}?{urlencode(query)}"

    def exchange(self, code: str) -> GoogleIdentity:
        response = self.http.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": self.redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if response.status_code != 200:
            raise UnauthorizedError("Google sign-in failed; please try again")
        return identity_from_id_token(response.json().get("id_token", ""), self.client_id)


def identity_from_id_token(id_token: str, client_id: str) -> GoogleIdentity:
    try:
        claims = jwt.decode(id_token, options={"verify_signature": False})
    except jwt.PyJWTError as error:
        raise UnauthorizedError("Google sign-in failed; please try again") from error
    now = datetime.now(UTC).timestamp()
    if (
        claims.get("iss") not in ISSUERS
        or claims.get("aud") != client_id
        or float(claims.get("exp", 0)) < now
        or not claims.get("sub")
        or not claims.get("email")
    ):
        raise UnauthorizedError("Google sign-in failed; please try again")
    return GoogleIdentity(
        sub=str(claims["sub"]),
        email=str(claims["email"]).strip().lower(),
        email_verified=bool(claims.get("email_verified")),
        name=str(claims.get("name") or claims["email"]),
    )
