"""Dashboard overview endpoint (requires TEST_DATABASE_URL)."""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app
from app.models import IntelligenceSignal
from app.models.enums import Confidence, Severity, SignalStatus
from tests.factories import make_carrier


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def signal(db: Session, carrier_id: int, key: str, severity: Severity, day: int, **kw) -> None:  # type: ignore[no-untyped-def]
    db.add(
        IntelligenceSignal(
            carrier_id=carrier_id,
            signal_key=key,
            signal_type="AUTHORITY_CHANGE",
            rule_id="authority_change",
            rule_version="1.1",
            severity=severity,
            confidence=Confidence.HIGH,
            title=f"Signal {key}",
            first_detected_at=datetime(2026, 10, day, tzinfo=UTC),
            **kw,
        )
    )
    db.flush()


def test_dashboard_totals_and_newest_signals(api: TestClient, db: Session) -> None:
    carrier = make_carrier(db, usdot_number=1234567)
    signal(db, carrier.id, "a", Severity.HIGH, 1)
    signal(db, carrier.id, "b", Severity.LOW, 3)
    signal(db, carrier.id, "c", Severity.INFO, 4)  # information: not counted, not listed
    signal(db, carrier.id, "d", Severity.MEDIUM, 2, status=SignalStatus.REVIEWED)
    signal(db, carrier.id, "e", Severity.HIGH, 5, is_active=False)

    body = api.get("/api/v1/dashboard").json()

    assert body["totals"]["carriers"] == 1
    assert body["totals"]["open_signals"] == 2
    assert body["totals"]["open_by_severity"] == {"HIGH": 1, "MEDIUM": 0, "LOW": 1}
    assert [s["title"] for s in body["recent_signals"]] == ["Signal b", "Signal d", "Signal a"]
    assert body["recent_signals"][0]["legal_name"] == "ACME TRUCKING LLC"
