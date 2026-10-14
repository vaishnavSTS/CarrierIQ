"""Broker sign-up (FMCSA broker authority required), the broker portal (any carrier, no
STS-internal data) and how it is kept apart from the client and internal portals."""

from collections.abc import Iterator
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.auth import get_broker_checker, get_google_client
from app.api.v1.routes.carriers import get_socrata_client
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.main import app
from app.models import Organization, User
from app.models.enums import OrganizationKind, UserRole, UserStatus
from app.services.broker_authority import BrokerAuthority, BrokerAuthorityChecker, IdKind
from tests.api.test_auth import PASSWORD, log_in, make_user
from tests.api.test_google_sign_in import FakeGoogle
from tests.ingestion.helpers import FakeDotApi, load_inspection_rows
from tests.services.test_carrier_search import UNITED

USDOT = 295017  # UNITED MOVING AND STORAGE INC in the fake FMCSA answers
MORGAN = BrokerAuthority(512885, "MC261603", "MORGAN INDUSTRIAL INC", "MOTUS")


class FakeChecker:
    """FMCSA shows active broker authority for MC 261603 / USDOT 512885 only."""

    def __init__(self) -> None:
        self.asked: list[tuple[str, int]] = []

    def check(self, kind: IdKind, number: int) -> BrokerAuthority:
        self.asked.append((kind, number))
        if (kind, number) in (("MC", 261603), ("USDOT", 512885)):
            return MORGAN
        raise ValidationError(f"FMCSA has no broker authority for {kind} {number}")


@pytest.fixture
def checker() -> FakeChecker:
    return FakeChecker()


@pytest.fixture
def api(
    db: Session, real_auth: None, checker: FakeChecker, google_on: None
) -> Iterator[TestClient]:
    headers, units = load_inspection_rows()
    fmcsa = FakeDotApi([UNITED], headers, units)

    def fake_client() -> Iterator[Any]:
        yield fmcsa.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    app.dependency_overrides[get_broker_checker] = lambda: checker
    app.dependency_overrides[get_google_client] = FakeGoogle
    with TestClient(app, follow_redirects=False) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def google_on(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "secret")


def broker_sign_up(**changes: object) -> dict[str, object]:
    body: dict[str, object] = {
        "full_name": "Sam Broker",
        "company_name": "Morgan Industrial",
        "email": "Sam@MorganBrokers.com",
        "phone": "(503) 647-7474",
        "password": PASSWORD,
        "id_kind": "MC",
        "id_number": 261603,
    }
    body.update(changes)
    return body


# --- Sign-up -----------------------------------------------------------------------------------


def test_broker_signs_up_with_an_mc_that_has_broker_authority(
    api: TestClient, db: Session, checker: FakeChecker
) -> None:
    response = api.post("/api/v1/auth/broker/register", json=broker_sign_up())

    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["role"], body["portal"], body["status"]) == ("BROKER_ADMIN", "broker", "ACTIVE")
    assert checker.asked == [("MC", 261603)]
    # Logged in at once: the brokerage, as FMCSA confirmed it.
    overview = api.get("/api/v1/broker/overview").json()
    assert overview["organization_name"] == "Morgan Industrial"
    assert (overview["docket_number"], overview["usdot_number"]) == ("MC261603", 512885)
    assert overview["authority_source"] == "MOTUS"
    organization = db.get(Organization, body["organization_id"])
    assert organization is not None and organization.kind == OrganizationKind.BROKER


def test_broker_can_sign_up_with_a_usdot_number(api: TestClient) -> None:
    response = api.post(
        "/api/v1/auth/broker/register", json=broker_sign_up(id_kind="USDOT", id_number=512885)
    )

    assert response.status_code == 201, response.text
    assert api.get("/api/v1/broker/overview").json()["docket_number"] == "MC261603"


def test_no_broker_authority_no_account(api: TestClient, db: Session) -> None:
    response = api.post("/api/v1/auth/broker/register", json=broker_sign_up(id_number=999))

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "FMCSA has no broker authority for MC 999"
    assert db.query(User).filter_by(email="sam@morganbrokers.com").first() is None


def test_broker_email_must_be_new(api: TestClient, db: Session) -> None:
    make_user(db, "sam@morganbrokers.com", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)

    response = api.post("/api/v1/auth/broker/register", json=broker_sign_up())

    assert response.status_code == 409


# --- Broker portal -------------------------------------------------------------------------------


def test_broker_opens_any_carrier_without_internal_fields(api: TestClient, db: Session) -> None:
    make_user(db, "broker@test.com", UserRole.BROKER_ADMIN, UserStatus.ACTIVE)
    assert log_in(api, "broker@test.com")["portal"] == "broker"

    search = api.get("/api/v1/broker/search", params={"q": str(USDOT)})
    assert search.status_code == 200, search.text
    result = search.json()["results"][0]
    assert result["usdot_number"] == USDOT
    assert (result["review_status"], result["open_signal_count"]) == (None, 0)

    profile = api.get(f"/api/v1/broker/carriers/{USDOT}")
    assert profile.status_code == 200, profile.text
    body = profile.json()
    assert body["legal_name"] == "UNITED MOVING AND STORAGE INC"
    assert (body["review_status"], body["open_signal_count"]) == (None, 0)
    for tab in ("safety", "inspections", "authority", "equipment", "network"):
        assert api.get(f"/api/v1/broker/carriers/{USDOT}/{tab}").status_code == 200, tab


def test_portals_are_kept_apart(api: TestClient, db: Session) -> None:
    make_user(db, "broker@test.com", UserRole.BROKER_ADMIN, UserStatus.ACTIVE)
    make_user(db, "owner@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    make_user(db, "analyst@sts.test", UserRole.STS_ANALYST, UserStatus.ACTIVE)

    log_in(api, "broker@test.com")
    for path in ("/portal/overview", f"/portal/carriers/{USDOT}", f"/carriers/{USDOT}", "/jobs"):
        assert api.get(f"/api/v1{path}").status_code == 403, path
    api.post("/api/v1/auth/logout")

    for email in ("owner@client.test", "analyst@sts.test"):
        log_in(api, email)
        for path in ("/broker/overview", "/broker/search?q=1", f"/broker/carriers/{USDOT}"):
            assert api.get(f"/api/v1{path}").status_code == 403, (email, path)
        api.post("/api/v1/auth/logout")


def test_sts_admin_sees_the_brokerage_of_a_new_broker(api: TestClient, db: Session) -> None:
    api.post("/api/v1/auth/broker/register", json=broker_sign_up())
    api.post("/api/v1/auth/logout")
    make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)
    log_in(api, "admin@sts.test")

    users = api.get("/api/v1/admin/users").json()

    broker = next(u for u in users if u["email"] == "sam@morganbrokers.com")
    assert broker["is_new"] and broker["portal"] == "broker"
    assert broker["broker"]["docket_number"] == "MC261603"
    added = api.post(f"/api/v1/admin/users/{broker['id']}/carriers", json={"usdot_number": 1})
    assert added.status_code == 422  # brokers already open any carrier


# --- Continue with Google as a broker ------------------------------------------------------------


def google_round_trip(api: TestClient, portal: str | None) -> str:
    params = {"portal": portal} if portal else {}
    start = api.get("/api/v1/auth/google/start", params=params)
    assert start.status_code == 302
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    back = api.get("/api/v1/auth/google/callback", params={"code": "c", "state": state})
    assert back.status_code == 302
    return str(back.headers["location"])


def test_new_google_user_from_the_broker_page_finishes_as_a_broker(api: TestClient) -> None:
    assert google_round_trip(api, "broker") == "/broker/register/google"
    assert api.get("/api/v1/auth/google/signup").json()["portal"] == "broker"

    done = api.post(
        "/api/v1/auth/broker/google/signup",
        json={
            "company_name": "Morgan Industrial",
            "phone": "5036477474",
            "id_kind": "MC",
            "id_number": 261603,
        },
    )

    assert done.status_code == 201, done.text
    assert (done.json()["role"], done.json()["email"]) == ("BROKER_ADMIN", "new@gmail.com")
    assert api.get("/api/v1/broker/overview").status_code == 200
    # Next time Google signs them straight into the broker portal.
    api.post("/api/v1/auth/logout")
    assert google_round_trip(api, None) == "/broker"


def test_google_sign_up_from_the_client_page_stays_a_client_sign_up(api: TestClient) -> None:
    assert google_round_trip(api, None) == "/register/google"
    assert api.get("/api/v1/auth/google/signup").json()["portal"] == "client"


# --- The FMCSA check ---------------------------------------------------------------------------


class FakeSocrata:
    def __init__(self, motus: list[dict[str, str]], legacy: list[dict[str, str]]) -> None:
        self.rows = {"inys-ebih": motus, "6eyk-hxee": legacy}
        self.queries: list[str] = []

    def get_rows(self, dataset_id: str, params: dict[str, str]) -> list[dict[str, str]]:
        self.queries.append(params["$where"])
        return self.rows[dataset_id]


def motus_row(kind: str, status: str) -> dict[str, str]:
    return {
        "docket_number": "MC261603",
        "usdot_number": "512885",
        "op_auth_type": kind,
        "op_auth_status": status,
        "legal_name": "MORGAN INDUSTRIAL INC",
    }


def legacy_row(broker_stat: str) -> dict[str, str]:
    return {
        "docket_number": "MC001234",
        "dot_number": "02234343",
        "broker_stat": broker_stat,
        "legal_name": "JAMZ TRUCKING, INC.",
    }


def check(motus: list[dict[str, str]], legacy: list[dict[str, str]]) -> BrokerAuthority:
    return BrokerAuthorityChecker(FakeSocrata(motus, legacy)).check("MC", 1234)  # type: ignore[arg-type]


def test_active_motus_broker_authority_passes() -> None:
    found = check([motus_row("Broker of Property (Except Household Goods)", "Active")], [])

    assert found == MORGAN


def test_motus_decides_over_legacy() -> None:
    revoked = [motus_row("Broker of Property (Except Household Goods)", "Revoked")]

    with pytest.raises(ValidationError, match="as revoked"):
        check(revoked, [legacy_row("A")])


def test_carrier_authority_is_not_broker_authority() -> None:
    carrier_only = [motus_row("Motor Carrier of Property (Except Household Goods)", "Active")]

    with pytest.raises(ValidationError, match="no broker authority"):
        check(carrier_only, [])


def test_legacy_decides_when_motus_has_no_broker_row() -> None:
    assert check([], [legacy_row("A")]) == BrokerAuthority(
        2234343, "MC1234", "JAMZ TRUCKING, INC.", "LEGACY_LI"
    )
    with pytest.raises(ValidationError, match="as inactive"):
        check([], [legacy_row("I")])


def test_both_docket_forms_are_asked_for() -> None:
    fake = FakeSocrata([], [legacy_row("A")])

    BrokerAuthorityChecker(fake).check("MC", 1234)  # type: ignore[arg-type]

    assert fake.queries[0] == "docket_number in ('MC1234', 'MC001234')"
