"""Rate limits and the Turnstile check on login and sign-up (no database, no Cloudflare)."""

from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.bot_protection import FAILED_LOGINS_PER_EMAIL, LOGIN_PER_IP, get_turnstile_verifier
from app.api.v1.routes.auth import get_auth_service
from app.core.config import get_settings
from app.core.exceptions import RateLimitedError, UnauthorizedError
from app.core.rate_limit import RateLimiter, limiter
from app.core.turnstile import TurnstileVerifier
from app.main import app

BODY = {"email": "a@b.co", "password": "wrong-password"}


class FakeService:
    def login(self, data: object) -> None:
        raise UnauthorizedError("Email or password is incorrect")


class FakeVerifier:
    def __init__(self, answer: bool) -> None:
        self.answer = answer
        self.tokens: list[str] = []

    def verify(self, token: str) -> bool:
        self.tokens.append(token)
        return self.answer


@pytest.fixture
def api() -> Iterator[TestClient]:
    limiter.reset()
    app.dependency_overrides[get_auth_service] = lambda: FakeService()
    yield TestClient(app)
    app.dependency_overrides.pop(get_auth_service, None)
    app.dependency_overrides.pop(get_turnstile_verifier, None)
    limiter.reset()


def turnstile_on(monkeypatch: pytest.MonkeyPatch, answer: bool) -> FakeVerifier:
    monkeypatch.setattr(get_settings(), "turnstile_site_key", "site")
    monkeypatch.setattr(get_settings(), "turnstile_secret_key", "secret")
    verifier = FakeVerifier(answer)
    app.dependency_overrides[get_turnstile_verifier] = lambda: verifier
    return verifier


# --- The limiter ---------------------------------------------------------------------------------


def test_limiter_refuses_over_the_limit_until_the_window_passes() -> None:
    now = [0.0]
    limits = RateLimiter(clock=lambda: now[0])
    limits.hit("k", 2, 60)
    now[0] = 10.0
    limits.hit("k", 2, 60)

    with pytest.raises(RateLimitedError) as refused:
        limits.hit("k", 2, 60)
    assert refused.value.retry_after == 50  # the first attempt leaves the window at 60

    now[0] = 60.0
    limits.hit("k", 2, 60)
    limits.hit("other", 2, 60)


def test_rate_limited_message_says_when() -> None:
    assert "1 minute." in RateLimitedError(30).message
    assert "15 minutes." in RateLimitedError(900).message
    assert "10 hours." in RateLimitedError(36000).message


# --- Rate limits on the routes -------------------------------------------------------------------


def test_login_is_limited_per_address(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    me = {"X-Forwarded-For": "203.0.113.9, 10.0.0.1"}
    for n in range(LOGIN_PER_IP[0]):
        body = {**BODY, "email": f"user{n}@b.co"}
        assert api.post("/api/v1/auth/login", json=body, headers=me).status_code == 401

    refused = api.post("/api/v1/auth/login", json=BODY, headers=me)
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "rate_limited"
    assert int(refused.headers["Retry-After"]) > 0

    # Someone else behind the same proxy is not affected.
    other = {"X-Forwarded-For": "203.0.113.10, 10.0.0.1"}
    assert api.post("/api/v1/auth/login", json=BODY, headers=other).status_code == 401


def test_wrong_passwords_lock_the_account_from_any_address(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    for n in range(FAILED_LOGINS_PER_EMAIL[0]):
        headers = {"X-Forwarded-For": f"203.0.113.{n}"}
        assert api.post("/api/v1/auth/login", json=BODY, headers=headers).status_code == 401

    headers = {"X-Forwarded-For": "198.51.100.1"}
    assert api.post("/api/v1/auth/login", json=BODY, headers=headers).status_code == 429


def test_limits_can_be_turned_off(api: TestClient) -> None:
    for _ in range(LOGIN_PER_IP[0] + 2):
        assert api.post("/api/v1/auth/login", json=BODY).status_code == 401


# --- Turnstile on the routes ---------------------------------------------------------------------


def test_turnstile_off_needs_no_token(api: TestClient) -> None:
    assert api.post("/api/v1/auth/login", json=BODY).status_code == 401
    assert api.get("/api/v1/auth/options").json()["turnstile_site_key"] is None


@pytest.mark.parametrize("path", ["/auth/login", "/auth/register", "/auth/broker/register"])
def test_turnstile_on_refuses_a_missing_token(
    api: TestClient, monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    verifier = turnstile_on(monkeypatch, True)

    answer = api.post(f"/api/v1{path}", json=BODY)

    assert answer.status_code == 400
    assert answer.json()["error"]["code"] == "bot_check_failed"
    assert verifier.tokens == []


def test_turnstile_refuses_a_bad_token(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    turnstile_on(monkeypatch, False)
    answer = api.post("/api/v1/auth/login", json=BODY, headers={"X-Turnstile-Token": "bad"})
    assert answer.status_code == 400


def test_turnstile_lets_a_good_token_through(
    api: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    verifier = turnstile_on(monkeypatch, True)

    answer = api.post("/api/v1/auth/login", json=BODY, headers={"X-Turnstile-Token": "good"})

    assert answer.status_code == 401  # past the check, on to the password
    assert verifier.tokens == ["good"]
    assert api.get("/api/v1/auth/options").json()["turnstile_site_key"] == "site"


# --- The call to Cloudflare ----------------------------------------------------------------------


def verifier_answering(handler: httpx.MockTransport) -> TurnstileVerifier:
    return TurnstileVerifier(httpx.Client(transport=handler))


def test_verifier_sends_the_secret_and_reads_the_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "turnstile_secret_key", "the-secret")
    seen: list[bytes] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request.content)
        return httpx.Response(200, json={"success": b"tok-good" in request.content})

    verifier = verifier_answering(httpx.MockTransport(answer))

    assert verifier.verify("tok-good") is True
    assert verifier.verify("tok-bad") is False
    assert b"secret=the-secret" in seen[0]
    assert verifier.verify("") is False
    assert verifier.verify("x" * 3000) is False
    assert len(seen) == 2  # those two never reached Cloudflare


def test_verifier_lets_people_in_when_cloudflare_is_down() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    assert verifier_answering(httpx.MockTransport(down)).verify("tok") is True
    outage = httpx.MockTransport(lambda request: httpx.Response(503))
    assert verifier_answering(outage).verify("tok") is True
