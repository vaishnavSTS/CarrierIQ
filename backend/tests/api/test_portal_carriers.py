"""Client portal carrier view: own verified carriers only, no STS-internal data."""

from collections.abc import Iterator
from datetime import UTC, date, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_socrata_client
from app.core.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models import OrganizationCarrier
from app.models.enums import UserRole, UserStatus
from app.schemas.carrier_profile import CarrierProfile, TimelineEventOut
from app.schemas.network import IdentityEventOut, LinkedCarrierOut, NetworkOut, OwnershipStateOut
from app.services.client_view import client_network, client_profile
from tests.api.test_auth import log_in, make_user
from tests.ingestion.helpers import FakeDotApi, load_inspection_rows
from tests.services.test_carrier_search import UNITED

USDOT = 295017  # UNITED MOVING AND STORAGE INC in the fake FMCSA answers


@pytest.fixture
def portal(db: Session, real_auth: None) -> Iterator[TestClient]:
    headers, units = load_inspection_rows()
    fmcsa = FakeDotApi([UNITED], headers, units)

    def fake_client() -> Iterator[Any]:
        yield fmcsa.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def client_with_carrier(db: Session, *, verified: bool) -> None:
    user = make_user(db, "owner@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    db.add(
        OrganizationCarrier(
            organization_id=user.organization_id, usdot_number=USDOT, verified=verified
        )
    )
    db.flush()


def test_client_opens_own_carrier_without_internal_fields(portal: TestClient, db: Session) -> None:
    client_with_carrier(db, verified=True)
    log_in(portal, "owner@client.test")

    profile = portal.get(f"/api/v1/portal/carriers/{USDOT}")
    assert profile.status_code == 200, profile.text
    body = profile.json()
    assert body["legal_name"] == "UNITED MOVING AND STORAGE INC"
    assert (body["review_status"], body["open_signal_count"]) == (None, 0)
    assert all(e["signal_id"] is None for e in body["timeline"])

    for tab in ("safety", "inspections", "authority", "equipment"):
        assert portal.get(f"/api/v1/portal/carriers/{USDOT}/{tab}").status_code == 200, tab


def test_client_searches_and_opens_other_carriers(portal: TestClient, db: Session) -> None:
    """Not only their own: a client can look up any carrier, in the same client view."""
    make_user(db, "owner@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)  # no carriers
    log_in(portal, "owner@client.test")

    search = portal.get("/api/v1/portal/search", params={"q": str(USDOT)})
    assert search.status_code == 200, search.text
    result = search.json()["results"][0]
    assert result["usdot_number"] == USDOT
    assert (result["review_status"], result["open_signal_count"]) == (None, 0)

    profile = portal.get(f"/api/v1/portal/carriers/{USDOT}")
    assert profile.status_code == 200, profile.text
    assert profile.json()["review_status"] is None
    assert portal.get(f"/api/v1/portal/carriers/{USDOT}/network").status_code == 200


def test_with_client_search_off_clients_see_only_their_own_carriers(
    portal: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The setting for after team testing: back to own carriers only, and no search."""
    monkeypatch.setattr(get_settings(), "client_search_enabled", False)
    client_with_carrier(db, verified=True)
    log_in(portal, "owner@client.test")

    other = portal.get("/api/v1/portal/carriers/1234567")
    assert other.status_code == 404
    assert other.json()["error"]["code"] == "carrier_not_found"
    assert portal.get(f"/api/v1/portal/carriers/{USDOT}/safety").status_code == 200
    assert portal.get("/api/v1/portal/search", params={"q": str(USDOT)}).status_code == 404
    assert portal.get("/api/v1/auth/options").json()["client_search"] is False


def test_each_side_is_kept_to_its_own_carrier_routes(portal: TestClient, db: Session) -> None:
    client_with_carrier(db, verified=True)
    make_user(db, "analyst@sts.test", UserRole.STS_ANALYST, UserStatus.ACTIVE)

    log_in(portal, "owner@client.test")
    assert portal.get(f"/api/v1/carriers/{USDOT}").status_code == 403
    assert portal.get(f"/api/v1/carriers/{USDOT}/signals").status_code == 403
    portal.post("/api/v1/auth/logout")

    log_in(portal, "analyst@sts.test")
    assert portal.get(f"/api/v1/portal/carriers/{USDOT}").status_code == 403
    assert portal.get("/api/v1/portal/search", params={"q": "1"}).status_code == 403


def test_client_network_drops_team_notes_and_signal_links() -> None:
    now = datetime.now(UTC)
    network = NetworkOut(
        usdot_number=USDOT,
        linked_carriers=[
            LinkedCarrierOut(
                usdot_number=1,
                legal_name="OTHER LLC",
                status="ACTIVE",
                registered=None,
                city=None,
                state=None,
                shares=[],
                signal_id=7,
            )
        ],
        links_checked_at=now,
        registration_checks=[],
        ownership=OwnershipStateOut(state="ATTESTED", summary="Attested on Highway", action="x"),
        identity_events=[
            IdentityEventOut(
                id=1,
                event_type="NOTE",
                event_date=date(2026, 10, 1),
                platform=None,
                description="Spoke to the owner",
                supporting_document=None,
                corrects_event_id=None,
                corrected_by=[],
                source="manual",
                entered_by="analyst",
                created_at=now,
            )
        ],
    )

    shown = client_network(network)

    assert shown.identity_events == []
    assert shown.ownership.state == "NONE"
    assert [(c.legal_name, c.signal_id) for c in shown.linked_carriers] == [("OTHER LLC", None)]


def test_client_profile_drops_team_note_timeline_events() -> None:
    events = [
        TimelineEventOut(
            event_type=t,
            event_date=date(2026, 1, 1),
            severity="LOW",
            title=t,
            description=None,
            signal_id=3,
        )
        for t in ("AUTHORITY_GRANTED", "IDENTITY_NOTE")
    ]
    # Only the fields client_profile touches matter.
    stub = CarrierProfile.model_construct(timeline=events, review_status="OPEN_SIGNALS")
    shown = client_profile(stub)

    assert [(e.event_type, e.signal_id) for e in shown.timeline] == [("AUTHORITY_GRANTED", None)]
    assert shown.review_status is None


def test_admin_links_a_carrier_to_an_existing_client(portal: TestClient, db: Session) -> None:
    client_user = make_user(db, "owner@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)

    log_in(portal, "admin@sts.test")
    added = portal.post(
        f"/api/v1/admin/users/{client_user.id}/carriers", json={"usdot_number": USDOT}
    )
    assert added.status_code == 200, added.text
    assert added.json()["usdot_numbers"] == [USDOT]
    portal.post("/api/v1/auth/logout")

    log_in(portal, "owner@client.test")
    assert portal.get(f"/api/v1/portal/carriers/{USDOT}").status_code == 200
