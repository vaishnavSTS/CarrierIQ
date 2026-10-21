"""Let the app send DataQs emails through the Gmail API, as one mailbox. Run once, on your computer:

    python -m app.workers.gmail_authorize            # listens on http://127.0.0.1:8765/
    python -m app.workers.gmail_authorize 8766       # another port

Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in backend/.env: a Google Cloud OAuth client
(type "Desktop app"; a "Web application" client works too once http://127.0.0.1:8765/ is one of
its authorized redirect URIs) in a project with the Gmail API enabled.

Opens Google in the browser: sign in as the mailbox that sends (the address in
DATAQS_EMAIL_FROM) and allow "Send email on your behalf". The refresh token is written to
backend/.env as GMAIL_REFRESH_TOKEN, never printed. Copy it from there to Render.
"""

import base64
import hashlib
import http.server
import secrets
import sys
import urllib.parse
import webbrowser
from email.utils import parseaddr
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.services.dataqs_email import GMAIL_SEND_SCOPE, GOOGLE_TOKEN_URL

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def set_env_value(text: str, key: str, value: str) -> str:
    """`text` (a .env file) with KEY=value replaced, or added at the end."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.split("=", 1)[0].strip() == key:
            lines[i] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    return "\n".join(lines) + "\n"


def wait_for_code(port: int, state: str) -> str:
    """Serve one request on 127.0.0.1:`port`: Google's redirect with ?code=..."""
    result: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            result.update({k: v[0] for k, v in query.items()})
            ok = "code" in result and result.get("state") == state
            self.send_response(200 if ok else 400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            message = (
                "Done. You can close this tab and go back to the terminal."
                if ok
                else "Something went wrong. Go back to the terminal."
            )
            self.wfile.write(f"<p style='font-family:sans-serif'>{message}</p>".encode())

        def log_message(self, *_: object) -> None:  # no request logging (the URL has the code)
            pass

    with http.server.HTTPServer(("127.0.0.1", port), Handler) as server:
        while not result:
            server.handle_request()
    if result.get("state") != state:
        sys.exit("The answer did not match this request (state); run the helper again.")
    if "code" not in result:
        sys.exit(f"Google did not give access: {result.get('error', 'unknown error')}")
    return result["code"]


def main(args: list[str]) -> None:
    if len(args) > 1 or (args and not args[0].isdigit()):
        sys.exit(__doc__)
    port = int(args[0]) if args else 8765
    settings = get_settings()
    if not (settings.gmail_client_id and settings.gmail_client_secret):
        sys.exit("Put GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in backend/.env first.")
    redirect_uri = f"http://127.0.0.1:{port}/"
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
    state = secrets.token_urlsafe(24)
    mailbox = parseaddr(settings.dataqs_email_from)[1]
    url = (
        AUTH_URL
        + "?"
        + urllib.parse.urlencode(
            {
                "client_id": settings.gmail_client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": GMAIL_SEND_SCOPE,
                "access_type": "offline",
                "prompt": "consent",  # always returns a refresh token
                "state": state,
                "code_challenge": challenge.decode().rstrip("="),
                "code_challenge_method": "S256",
                "login_hint": mailbox,
            }
        )
    )
    print(f"Sign in as {mailbox or 'the sending mailbox'} and allow sending email.")
    print("If the browser does not open, paste this address into it:\n")
    print(url + "\n")
    webbrowser.open(url)
    code = wait_for_code(port, state)

    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.gmail_client_id,
            "client_secret": settings.gmail_client_secret,
            "code": code,
            "code_verifier": verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        },
        timeout=20,
    )
    body = response.json()
    if response.status_code >= 400 or "refresh_token" not in body:
        sys.exit(f"Google did not issue a token: {body.get('error_description') or body}")
    if GMAIL_SEND_SCOPE not in body.get("scope", ""):
        sys.exit("Access was given without 'Send email'; run again and tick that box.")
    text = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    ENV_FILE.write_text(
        set_env_value(text, "GMAIL_REFRESH_TOKEN", body["refresh_token"]), encoding="utf-8"
    )
    print(f"Saved GMAIL_REFRESH_TOKEN to {ENV_FILE} (not shown here). Copy it to Render.")


if __name__ == "__main__":
    main(sys.argv[1:])
