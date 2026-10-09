"""Signal engine: shared VIN rule, saving, evidence enforcement (requires TEST_DATABASE_URL)."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.intelligence.base_rule import Rule, RuleContext, SignalValues
from app.models import IntelligenceSignal, Relationship, SignalEvidence, Vehicle
from app.models.enums import Confidence, Severity, SignalStatus
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.signal_repository import SignalRepository
from app.repositories.timeline_repository import TimelineRepository
from app.services.signal_service import MissingEvidenceError, SignalService, default_rules
from tests.factories import make_carrier
from tests.ingestion.helpers import FakeDotApi
from tests.services.test_carrier_equipment import api_client  # noqa: F401
from tests.services.test_shared_vin_service import FREIGHTLINER, ISUZU, api, run  # noqa: F401

NOW = datetime(2026, 10, 8, 12, tzinfo=UTC)


def service(db: Session) -> SignalService:
    return SignalService(
        db, SignalRepository(db), TimelineRepository(db), default_rules(), now=lambda: NOW
    )


def signals(db: Session) -> dict[str, IntelligenceSignal]:
    return {s.signal_key or "": s for s in db.scalars(select(IntelligenceSignal))}


def evidence(db: Session, signal: IntelligenceSignal) -> list[SignalEvidence]:
    return list(db.scalars(select(SignalEvidence).where(SignalEvidence.signal_id == signal.id)))


def test_one_shared_vin_signal_per_other_carrier(db: Session, api: FakeDotApi) -> None:  # noqa: F811
    make_carrier(db, usdot_number=777, legal_name="SEVEN SEVEN SEVEN LLC")
    run(db, api)
    carrier = CarrierRepository(db).get_by_usdot(295017)
    assert carrier is not None

    service(db).rebuild(carrier)

    found = signals(db)
    assert set(found) == {"shared_vin:777", "shared_vin:888"}
    isuzu = found["shared_vin:888"]
    assert (isuzu.signal_type, isuzu.rule_id, isuzu.rule_version) == (
        "SHARED_VIN",
        "shared_vin",
        "1.1",
    )
    assert (isuzu.severity, isuzu.confidence) == (Severity.LOW, Confidence.HIGH)  # 2 inspections
    assert "not loaded in CarrierIQ" in (isuzu.description or "")
    rows = evidence(db, isuzu)
    assert len(rows) == 2  # where it was seen with USDOT 888, and with this carrier
    assert (
        rows[0].observed_value
        == f"VIN {ISUZU} on inspections of USDOT 888: 2 inspections, 2023-05-01 to 2023-06-01"
    )
    assert all(r.raw_record_id is not None and r.entity_type == "relationship" for r in rows)

    freightliner = found["shared_vin:777"]
    assert freightliner.confidence == Confidence.MEDIUM  # one VIN, one inspection
    assert "SEVEN SEVEN SEVEN LLC" in freightliner.title
    assert FREIGHTLINER in (evidence(db, freightliner)[0].observed_value or "")


def test_rerun_keeps_review_status_and_ends_signals_that_disappear(
    db: Session,
    api: FakeDotApi,  # noqa: F811
) -> None:
    run(db, api)
    carrier = CarrierRepository(db).get_by_usdot(295017)
    assert carrier is not None
    service(db).rebuild(carrier)
    before = signals(db)
    before["shared_vin:888"].status = SignalStatus.REVIEWED

    service(db).rebuild(carrier)
    again = signals(db)
    assert again["shared_vin:888"].id == before["shared_vin:888"].id
    assert again["shared_vin:888"].status == SignalStatus.REVIEWED
    assert len(evidence(db, again["shared_vin:888"])) == 2  # replaced, not duplicated

    db.execute(delete(Relationship).where(Relationship.target_entity_id == 888))
    new, ended = service(db).rebuild(carrier)["shared_vin"]

    assert (new, ended) == (0, 1)
    gone = signals(db)["shared_vin:888"]
    assert (gone.is_active, gone.status) == (False, SignalStatus.REVIEWED)  # kept on record
    assert SignalRepository(db).for_carrier(carrier.id) == [signals(db)["shared_vin:777"]]


class NoEvidenceRule(Rule):
    rule_id = "broken"
    rule_version = "0.1"

    def evaluate(self, context: RuleContext) -> list[SignalValues]:
        return [
            SignalValues(
                signal_key="broken:1",
                signal_type="BROKEN",
                severity=Severity.HIGH,
                confidence=Confidence.HIGH,
                title="Unsupported claim",
                description="No evidence.",
                evidence=(),
            )
        ]


def test_signal_without_evidence_is_never_saved(db: Session) -> None:
    carrier = make_carrier(db)
    rules = [*default_rules(), NoEvidenceRule()]

    with pytest.raises(MissingEvidenceError, match="broken:1"):
        SignalService(
            db, SignalRepository(db), TimelineRepository(db), rules, now=lambda: NOW
        ).rebuild(carrier)
    assert signals(db) == {}


def test_signals_endpoint(api_client: TestClient) -> None:  # noqa: F811
    response = api_client.get("/api/v1/carriers/295017/signals")

    assert response.status_code == 200
    body = response.json()
    types = sorted(s["signal_type"] for s in body["signals"])
    assert types == ["FLEET_CONSISTENCY", "SHARED_VIN", "SHARED_VIN"]  # 3 of 18 seen
    first = next(s for s in body["signals"] if s["signal_type"] == "SHARED_VIN")
    assert first["status"] == "OPEN"
    assert len(first["evidence"]) == 2
    assert first["evidence"][0]["source"] == "dot_socrata"

    profile = api_client.get("/api/v1/carriers/295017").json()
    assert (profile["review_status"], profile["open_signal_count"]) == ("OPEN_SIGNALS", 3)
    assert profile["highest_open_severity"] == "LOW"
    (result,) = api_client.get("/api/v1/carriers/search", params={"q": "295017"}).json()["results"]
    assert (result["review_status"], result["open_signal_count"]) == ("OPEN_SIGNALS", 3)


def test_mistyped_vin_lowers_confidence(db: Session, api: FakeDotApi) -> None:  # noqa: F811
    run(db, api)
    carrier = CarrierRepository(db).get_by_usdot(295017)
    assert carrier is not None
    vehicle = db.scalars(select(Vehicle).where(Vehicle.vin == FREIGHTLINER)).one()
    vehicle.check_digit_valid = False  # vPIC: check digit doesn't calculate

    service(db).rebuild(carrier)

    found = signals(db)["shared_vin:777"]
    assert found.confidence == Confidence.LOW  # a typo can match another carrier's vehicle
    assert "possibly mistyped" in (evidence(db, found)[0].observed_value or "")
    assert signals(db)["shared_vin:888"].confidence == Confidence.HIGH


def test_review_a_signal(api_client: TestClient, db: Session) -> None:  # noqa: F811
    signals = api_client.get("/api/v1/carriers/295017/signals").json()["signals"]
    target = next(s for s in signals if s["signal_type"] == "SHARED_VIN")

    response = api_client.patch(
        f"/api/v1/signals/{target['id']}",
        json={"status": "REVIEWED", "note": "  Leased tractor, confirmed with the carrier.  "},
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["status"], body["review_note"]) == (
        "REVIEWED",
        "Leased tractor, confirmed with the carrier.",
    )
    assert body["reviewed_at"] is not None
    assert len(body["evidence"]) == 2
    profile = api_client.get("/api/v1/carriers/295017").json()
    assert profile["open_signal_count"] == 2  # one fewer to review

    carrier = CarrierRepository(db).get_by_usdot(295017)
    assert carrier is not None
    service(db).rebuild(carrier)  # a refresh re-runs every rule
    again = next(
        s
        for s in api_client.get("/api/v1/carriers/295017/signals").json()["signals"]
        if s["id"] == target["id"]
    )
    assert (again["status"], again["review_note"]) == (body["status"], body["review_note"])

    reopened = api_client.patch(f"/api/v1/signals/{target['id']}", json={"status": "OPEN"}).json()
    assert (reopened["status"], reopened["reviewed_at"], reopened["review_note"]) == (
        "OPEN",
        None,
        None,
    )


def test_review_validation(api_client: TestClient) -> None:  # noqa: F811
    assert (
        api_client.patch("/api/v1/signals/999999", json={"status": "REVIEWED"}).status_code == 404
    )
    signal_id = api_client.get("/api/v1/carriers/295017/signals").json()["signals"][0]["id"]
    bad = api_client.patch(f"/api/v1/signals/{signal_id}", json={"status": "APPROVED"})
    assert bad.status_code == 422
    long_note = api_client.patch(
        f"/api/v1/signals/{signal_id}", json={"status": "DISMISSED", "note": "x" * 2001}
    )
    assert long_note.status_code == 422
