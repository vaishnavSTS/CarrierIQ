"""Try Now: one search, one time only, with only the two free tabs' data (no FMCSA)."""

from collections.abc import Iterator
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.bot_protection import get_turnstile_verifier
from app.api.v1.routes.carriers import (
    get_carrier_authority_service,
    get_carrier_profile_service,
)
from app.api.v1.routes.try_now import TryUses, get_try_uses
from app.core.config import get_settings
from app.core.exceptions import CarrierNotFoundError
from app.core.rate_limit import limiter
from app.core.security import create_purpose_token
from app.main import app
from app.schemas.carrier_authority import CarrierAuthorityOut
from app.schemas.carrier_profile import (
    AuthorityOut,
    CarrierProfile,
    EquipmentOut,
    InsuranceOut,
    SafetyOut,
    VehicleOut,
)

KNOWN = 111
OTHER = 222
START = "/api/v1/try/start"
ME = {"X-Forwarded-For": "203.0.113.5"}


def profile(usdot: int) -> CarrierProfile:
    """The staff answer, with data the free tabs must not reveal."""
    fields: dict[str, object] = {
        name: None
        for name, info in CarrierProfile.model_fields.items()
        if info.is_required() and "None" in str(info.annotation)
    }
    return CarrierProfile.model_validate(
        {
            **fields,
            "usdot_number": usdot,
            "legal_name": f"CARRIER {usdot}",
            "stale": False,
            "addresses": [],
            "phones": [],
            "officers": ["PAT OWNER"],
            "domains": [],
            "authority": AuthorityOut(status="ACTIVE", dockets=[]),
            "insurance": InsuranceOut(status="ON_FILE", source_system="MOTUS", as_of=None),
            "safety": SafetyOut(
                inspection_count=9,
                vehicle_oos_count=3,
                driver_oos_count=2,
                vehicle_oos_rate=0.5,
                driver_oos_rate=0.5,
                first_inspection_date=None,
                last_inspection_date=None,
                by_year=[],
                recent_inspections=[],
                safety_rating="SATISFACTORY",
                safety_rating_date=None,
            ),
            "equipment": EquipmentOut(
                power_units=4,
                observed_vehicle_count=1,
                vehicles=[
                    VehicleOut(
                        vin="SECRETVIN",
                        inspections=1,
                        first_seen=datetime.now(UTC).date(),
                        last_seen=datetime.now(UTC).date(),
                    )
                ],
            ),
            "recent_changes": [
                {
                    "attribute": "fleet_size",
                    "old_value": "1",
                    "new_value": "2",
                    "changed_on": datetime.now(UTC).date(),
                }
            ],
            "timeline": [],
            "review_status": "OPEN_SIGNALS",
            "open_signal_count": 4,
        }
    )


class FakeProfiles:
    def __init__(self) -> None:
        self.asked: list[int] = []

    def get(self, usdot: int) -> CarrierProfile:
        self.asked.append(usdot)
        if usdot == 404404:
            raise CarrierNotFoundError("No carrier with USDOT 404404")
        return profile(usdot)


class FakeAuthority:
    def get(self, usdot: int) -> CarrierAuthorityOut:
        return CarrierAuthorityOut(
            usdot_number=usdot,
            dockets=[],
            current_insurance=[],
            insurance_history=[],
            authority_history=[],
        )


class FakeUses:
    """The stored searches; survives what a server restart wouldn't reset."""

    def __init__(self) -> None:
        self.visitors: dict[str, int] = {}

    def used(self, visitor: str) -> bool:
        return visitor in self.visitors

    def claim(self, visitor: str, usdot: int) -> bool:
        if visitor in self.visitors:
            return False
        self.visitors[visitor] = usdot
        return True


@pytest.fixture
def uses() -> FakeUses:
    return FakeUses()


@pytest.fixture
def profiles() -> FakeProfiles:
    return FakeProfiles()


@pytest.fixture
def api(
    profiles: FakeProfiles, uses: FakeUses, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    limiter.reset()
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)
    app.dependency_overrides[get_carrier_profile_service] = lambda: profiles
    app.dependency_overrides[get_carrier_authority_service] = lambda: FakeAuthority()
    app.dependency_overrides[get_try_uses] = lambda: uses
    yield TestClient(app)
    app.dependency_overrides.pop(get_try_uses, None)
    app.dependency_overrides.pop(get_carrier_profile_service, None)
    app.dependency_overrides.pop(get_carrier_authority_service, None)
    app.dependency_overrides.pop(get_turnstile_verifier, None)
    limiter.reset()


def test_a_visitor_opens_one_carrier_without_an_account(api: TestClient) -> None:
    answer = api.post(START, json={"usdot_number": KNOWN}, headers=ME)

    assert answer.status_code == 200
    assert answer.json()["legal_name"] == f"CARRIER {KNOWN}"
    assert api.get(f"/api/v1/try/carriers/{KNOWN}").status_code == 200
    assert api.get(f"/api/v1/try/carriers/{KNOWN}/authority").status_code == 200


def test_the_answer_leaves_out_what_the_locked_tabs_show(api: TestClient) -> None:
    body = api.post(START, json={"usdot_number": KNOWN}, headers=ME).json()

    assert body["officers"] == ["PAT OWNER"]  # Identity stays
    assert body["equipment"]["power_units"] == 4
    assert "SECRETVIN" not in str(body)
    assert body["equipment"]["vehicles"] == []
    assert body["safety"]["inspection_count"] == 0
    assert body["safety"]["safety_rating"] is None
    assert body["recent_changes"] == [] and body["timeline"] == []
    assert body["review_status"] is None and body["open_signal_count"] == 0


def test_a_second_carrier_needs_an_account(api: TestClient, profiles: FakeProfiles) -> None:
    assert api.post(START, json={"usdot_number": KNOWN}, headers=ME).status_code == 200

    refused = api.post(START, json={"usdot_number": OTHER}, headers=ME)

    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "try_limit_reached"
    assert OTHER not in profiles.asked  # refused before any FMCSA lookup


def test_the_same_carrier_cannot_be_searched_again(api: TestClient) -> None:
    assert api.post(START, json={"usdot_number": KNOWN}, headers=ME).status_code == 200
    assert api.post(START, json={"usdot_number": KNOWN}, headers=ME).status_code == 429


def test_the_block_outlasts_a_server_restart(api: TestClient) -> None:
    """A new browser at the same address, after the in-memory limits were wiped."""
    assert api.post(START, json={"usdot_number": KNOWN}, headers=ME).status_code == 200
    limiter.reset()
    api.cookies.clear()

    assert api.post(START, json={"usdot_number": KNOWN}, headers=ME).status_code == 429


def test_the_browser_stays_blocked_on_another_network(api: TestClient) -> None:
    assert api.post(START, json={"usdot_number": KNOWN}, headers=ME).status_code == 200
    elsewhere = {"X-Forwarded-For": "198.51.100.77"}

    assert api.post(START, json={"usdot_number": OTHER}, headers=elsewhere).status_code == 429


def test_the_address_itself_is_not_stored(api: TestClient, uses: FakeUses) -> None:
    api.post(START, json={"usdot_number": KNOWN}, headers=ME)
    (visitor,) = uses.visitors
    assert "203.0.113.5" not in visitor and len(visitor) == 64


def test_the_stored_search_in_the_database(db: Session) -> None:
    store = TryUses(db)
    assert store.used("visitor") is False
    assert store.claim("visitor", KNOWN) is True
    assert store.used("visitor") is True
    assert store.claim("visitor", OTHER) is False


def test_another_visitor_has_their_own_search(api: TestClient) -> None:
    api.post(START, json={"usdot_number": KNOWN}, headers=ME)
    api.cookies.clear()  # another browser
    other = {"X-Forwarded-For": "203.0.113.6"}
    assert api.post(START, json={"usdot_number": OTHER}, headers=other).status_code == 200


def test_a_mistyped_number_does_not_use_up_the_search(api: TestClient) -> None:
    assert api.post(START, json={"usdot_number": 404404}, headers=ME).status_code == 404
    assert api.post(START, json={"usdot_number": KNOWN}, headers=ME).status_code == 200


def test_mistyped_numbers_are_limited_too(api: TestClient) -> None:
    for _ in range(10):
        assert api.post(START, json={"usdot_number": 404404}, headers=ME).status_code == 404
    assert api.post(START, json={"usdot_number": 404404}, headers=ME).status_code == 429


def test_no_cookie_or_another_carrier_is_refused(api: TestClient) -> None:
    assert api.get(f"/api/v1/try/carriers/{KNOWN}").status_code == 403
    assert api.get(f"/api/v1/try/carriers/{KNOWN}/authority").status_code == 403

    api.post(START, json={"usdot_number": KNOWN}, headers=ME)

    assert api.get(f"/api/v1/try/carriers/{OTHER}").status_code == 403
    assert api.get(f"/api/v1/try/carriers/{OTHER}/authority").status_code == 403


def test_the_cookie_opens_nothing_else(real_auth: None, api: TestClient) -> None:
    api.post(START, json={"usdot_number": KNOWN}, headers=ME)

    for path in ("/safety", "/network", "/equipment", "/chameleon", "/inspections"):
        assert api.get(f"/api/v1/try/carriers/{KNOWN}{path}").status_code == 404, path
    assert api.get(f"/api/v1/carriers/{KNOWN}").status_code in (401, 403)
    assert api.get(f"/api/v1/broker/carriers/{KNOWN}/safety").status_code == 401
    assert api.get("/api/v1/auth/me").status_code == 401


def test_other_tokens_are_not_a_try_cookie(api: TestClient) -> None:
    wrong = create_purpose_token({"usdot": str(KNOWN)}, "password_reset", 30)
    api.cookies.set("carrieriq_try", wrong)
    assert api.get(f"/api/v1/try/carriers/{KNOWN}").status_code == 403


def test_the_bot_checks_apply(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    body = {"usdot_number": KNOWN}
    trap = {**ME, "X-Form-Trap": "http://spam.example"}
    assert api.post(START, json=body, headers=trap).status_code == 400

    monkeypatch.setattr(get_settings(), "turnstile_site_key", "site")
    monkeypatch.setattr(get_settings(), "turnstile_secret_key", "secret")
    app.dependency_overrides[get_turnstile_verifier] = lambda: SimpleNamespace(
        verify=lambda token: token == "good"
    )
    assert api.post(START, json=body, headers=ME).status_code == 400
    with_token = {**ME, "X-Turnstile-Token": "good"}
    assert api.post(START, json=body, headers=with_token).status_code == 200
