"""Network & Identity: registration checks, linked carriers, ownership events
(requires TEST_DATABASE_URL)."""

from collections.abc import Iterator
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_socrata_client
from app.db.session import get_db
from app.main import app
from app.models import Address, Authority, Carrier
from app.models.enums import AddressType, DocketPrefix
from app.services.boc3_service import ProcessAgent
from app.services.registration_health import address_peer, registration_checks
from tests.ingestion.helpers import BOC3_DATASETS, ORDER_DATASETS, FakeDotApi, load_census_rows
from tests.services.test_contact_links import OTHERS

TODAY = date(2026, 10, 9)
FROZEN = date(2026, 5, 14)


def carrier(**kw: Any) -> Carrier:
    return Carrier(usdot_number=3794204, legal_name="AJOHAR TRANSPORTATION INC", **kw)


def checks(**kw: Any) -> dict[str, Any]:
    args: dict[str, Any] = {
        "carrier": carrier(last_mcs150_date=date(2026, 1, 15)),
        "census": {},
        "authorities": [],
        "addresses": [],
        "oos_orders": [],
        "revocations": [],
        "legacy_frozen_on": FROZEN,
        "today": TODAY,
    }
    args.update(kw)
    return {c.key: c for c in registration_checks(**args)}


def authority(source: str) -> Authority:
    return Authority(
        docket_prefix=DocketPrefix.MC,
        docket_number="1363132",
        status="ACTIVE",
        status_source=source,
    )


def test_legacy_only_registration_is_explained_not_alarming() -> None:
    found = checks(authorities=[authority("LEGACY_LI")])

    motus = found["motus"]
    assert motus.status == "attention"
    assert "stopped updating on 2026-05-14" in motus.detail
    assert "has not been claimed in Motus yet" in motus.detail
    assert "CarrierIQ cannot confirm the status" in motus.detail  # not our verdict
    assert checks(authorities=[authority("MOTUS")])["motus"].status == "ok"


def test_mcs150_age() -> None:
    assert checks()["mcs150"].status == "ok"
    old = checks(carrier=carrier(last_mcs150_date=date(2024, 1, 1)))["mcs150"]
    assert old.status == "attention" and "every two years" in old.detail


def test_prior_revocation_link() -> None:
    other = checks(census={"prior_revoke_flag": "Y", "prior_revoke_dot_number": "1234567"})
    own = checks(census={"prior_revoke_flag": "Y", "prior_revoke_dot_number": "3794204"})

    assert other["prior_revoke"].status == "alert"
    assert "USDOT 1234567" in other["prior_revoke"].detail
    assert own["prior_revoke"].status == "info"
    assert checks()["prior_revoke"].status == "ok"


def test_orders_and_addresses() -> None:
    active = checks(
        oos_orders=[
            {"oos_date": "2026-09-01", "oos_reason": "New Entrant Revoked", "status": "ACTIVE"}
        ]
    )
    assert active["oos"].status == "alert" and "New Entrant Revoked" in active["oos"].detail
    recent = checks(
        revocations=[
            {"order1_serve_date": "20260801", "order1_type_desc": "Involuntary Suspension"}
        ]
    )
    assert recent["revocations"].status == "attention"
    bad = [
        Address(address_type=AddressType.MAILING, undeliverable=True),
        Address(address_type=AddressType.PHYSICAL, undeliverable=True),
    ]
    marked = checks(addresses=bad, census={"carrier_mailing_und_date": "20240723"})["address"]
    assert marked.status == "attention" and marked.as_of == date(2024, 7, 23)
    assert marked.detail.startswith(
        "FMCSA's census marks the mailing and physical addresses as undeliverable "
        "(mailing address marked on 2024-07-23)"
    )
    assert "The census does not say why." in marked.detail
    assert "address" not in checks()


def test_undeliverable_address_names_carriers_at_the_same_address() -> None:
    """Vanek Brothers is marked; Vanek Re-Ship, same address written differently, is not."""
    census = {"phy_street": "3920 SOUTH LOOMIS", "carrier_mailing_und_date": "20240723"}
    peers = [
        address_peer(
            2389409, {"legal_name": "VANEK RE-SHIP CORPORATION", "phy_street": "3920 S LOOMIS"}
        ),
        address_peer(
            1000001,
            {"legal_name": "OTHER CO", "phy_street": "3920 SOUTH LOOMIS", "undeliv_phy": "U"},
        ),
    ]
    bad = [Address(address_type=AddressType.MAILING, undeliverable=True)]

    detail = checks(addresses=bad, census=census, address_peers=peers)["address"].detail

    assert (
        "FMCSA's census also lists USDOT 1000001 (OTHER CO) at the same address, and also marks "
        "it undeliverable; USDOT 2389409 (VANEK RE-SHIP CORPORATION) at the same address, "
        'written "3920 S LOOMIS" there (this carrier\'s record: "3920 SOUTH LOOMIS"), and does '
        "not mark it undeliverable."
    ) in detail
    assert "why one record is marked and another is not" in detail


def agent(source: str, name: str = "ALLAMERICAN AGENTS OF PROCESS") -> ProcessAgent:
    return ProcessAgent("MC1363132", name, None, "SIOUX FALLS", "SD", source)


def test_boc3_process_agent() -> None:
    motus = [authority("MOTUS")]
    assert "boc3" not in checks(process_agents=[])  # no docket: no BOC-3 needed
    assert checks(authorities=motus)["boc3"].status == "unknown"  # not fetched yet

    ok = checks(authorities=motus, process_agents=[agent("MOTUS")])["boc3"]
    assert ok.status == "ok"
    assert ok.detail.startswith(
        "FMCSA's current system (Motus) lists ALLAMERICAN AGENTS OF PROCESS (MC1363132) as "
        "process agent"
    )

    legacy = checks(authorities=motus, process_agents=[agent("LEGACY_LI")])["boc3"]
    assert (legacy.status, legacy.as_of) == ("attention", FROZEN)
    assert "but FMCSA's current system (Motus) lists none" in legacy.detail

    missing = checks(authorities=motus, process_agents=[])["boc3"]
    assert missing.status == "attention"
    assert "lists no process agent for this carrier" in missing.detail
    revoked = Authority(docket_prefix=DocketPrefix.MC, docket_number="1", status="REVOKED")
    assert checks(authorities=[revoked], process_agents=[])["boc3"].status == "info"


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    fake = FakeDotApi(load_census_rows() + OTHERS)
    fake.orders[ORDER_DATASETS[0]] = [
        {
            "dot_number": "295017",
            "oos_date": "2019-03-01",
            "oos_reason": "Fine",
            "status": "RESCINDED",
        }
    ]
    legacy_row = {
        "docket_number": "MC123456",
        "dot_number": "00295017",
        "co_name": "ALLAMERICAN AGENTS OF PROCESS",
        "attn_to_or_title": "DAVID B. ROSE,  VP",
        "city": "SIOUX FALLS,",
        "state_code": "SD",
    }
    # The same agent listed twice, plus a different carrier whose padded number only ends alike.
    fake.boc3[BOC3_DATASETS[1]] = [legacy_row, legacy_row, {**legacy_row, "dot_number": "03295017"}]

    def fake_client() -> Iterator[Any]:
        yield fake.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_network_endpoint(api: TestClient) -> None:
    body = api.get("/api/v1/carriers/295017/network").json()

    linked = {c["usdot_number"]: c for c in body["linked_carriers"]}
    assert body["linked_carriers"][0]["usdot_number"] == 900001  # phone link: strongest
    movers = linked[900001]
    assert (movers["legal_name"], movers["status"]) == ("UNITED MOVERS LLC", "INACTIVE")
    assert [s["kind"] for s in movers["shares"]] == ["phone", "officer"]
    assert movers["shares"][0]["value"] == "3604794800"
    assert movers["signal_id"] is not None
    assert linked[900002]["shares"][0]["kind"] == "building"
    assert linked[900002]["signal_id"] is None
    assert body["links_checked_at"] is not None
    statuses = {c["key"]: c["status"] for c in body["registration_checks"]}
    assert statuses["oos"] == "info"  # an old, rescinded order
    assert body["ownership"]["state"] == "NONE"


def test_authority_endpoint_lists_process_agents(api: TestClient) -> None:
    body = api.get("/api/v1/carriers/295017/authority").json()

    assert body["process_agents"] == [
        {
            "docket": "MC123456",
            "name": "ALLAMERICAN AGENTS OF PROCESS",
            "attention": "DAVID B. ROSE, VP",
            "city": "SIOUX FALLS",
            "state": "SD",
            "source_system": "LEGACY_LI",
        }
    ]


def test_ownership_attestation_and_correction(api: TestClient) -> None:
    api.get("/api/v1/carriers/295017/network")  # load the carrier
    attested = api.post(
        "/api/v1/carriers/295017/identity-events",
        json={
            "event_type": "OWNERSHIP_CHANGE_ATTESTED",
            "event_date": "2026-09-10",
            "platform": "Highway",
            "description": "Owner selected 'Ownership change' by mistake during verification.",
            "supporting_document": "Highway support emails, Sep 15 - Oct 7",
        },
    )
    assert attested.status_code == 201, attested.text
    attestation_id = attested.json()["id"]

    fixed = api.post(
        "/api/v1/carriers/295017/identity-events",
        json={
            "event_type": "ATTESTATION_CORRECTED",
            "event_date": "2026-09-16",
            "platform": "Highway",
            "description": "Second attestation: the first was an error; ownership unchanged.",
            "corrects_event_id": attestation_id,
        },
    )
    assert fixed.status_code == 201

    body = api.get("/api/v1/carriers/295017/network").json()
    assert body["ownership"]["state"] == "CONFLICTING"
    assert "Conflicting historical attestation exists on Highway" in body["ownership"]["summary"]
    events = body["identity_events"]
    assert events[0]["corrected_by"] == [fixed.json()["id"]]

    signals = api.get("/api/v1/carriers/295017/signals").json()["signals"]
    ownership = next(s for s in signals if s["signal_type"] == "OWNERSHIP_EVENT")
    assert ownership["title"] == "Conflicting ownership attestation on Highway"
    assert "This is not a finding of fraud" in ownership["description"]
    assert len(ownership["evidence"]) == 2
    timeline = api.get("/api/v1/carriers/295017").json()["timeline"]
    attested_entry = next(
        e for e in timeline if e["event_type"] == "IDENTITY_OWNERSHIP_CHANGE_ATTESTED"
    )
    assert attested_entry["signal_id"] == ownership["id"]


def test_identity_event_validation(api: TestClient) -> None:
    api.get("/api/v1/carriers/295017/network")
    url = "/api/v1/carriers/295017/identity-events"
    base = {"event_type": "NOTE", "event_date": "2026-09-10", "description": "Called owner."}

    assert api.post(url, json={**base, "event_date": "2099-01-01"}).status_code == 422
    assert api.post(url, json={**base, "description": "   "}).status_code == 422
    note = api.post(url, json=base).json()
    bad_correction = {
        **base,
        "event_type": "ATTESTATION_CORRECTED",
        "corrects_event_id": note["id"],
    }
    assert api.post(url, json=bad_correction).status_code == 422
    assert api.post("/api/v1/carriers/999999/identity-events", json=base).status_code == 404
