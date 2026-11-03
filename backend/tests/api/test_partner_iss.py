"""The partner API: another system asks for a carrier's Estimated ISS with its API key."""

import hashlib
from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.routes.partner import get_partner_iss_service
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.main import app
from app.models import Carrier, IssReference, IssSnapshot
from app.schemas.carrier_safety import EstimatedIssOut
from app.services import partner_iss
from app.services.partner_iss import PartnerIssService
from tests.factories import make_carrier

KEY = "css_test-partner-key"
HEADERS = {"X-Api-Key": KEY}
SEP = date(2026, 9, 1)
OCT = date(2026, 10, 1)


class Loads:
    """Stands in for fetching a carrier from FMCSA; remembers what was fetched."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.fetched: list[int] = []

    def __call__(self, usdot: int) -> Carrier | None:
        self.fetched.append(usdot)
        if usdot == 404404:
            return None  # FMCSA has no such carrier
        return self.db.scalar(select(Carrier).where(Carrier.usdot_number == usdot)) or make_carrier(
            self.db, usdot, "FETCHED FROM FMCSA LLC"
        )


@pytest.fixture
def loads(db: Session) -> Loads:
    return Loads(db)


@pytest.fixture
def api(db: Session, loads: Loads, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    limiter.reset()
    monkeypatch.setattr(
        get_settings(), "partner_api_key_hashes", "x," + hashlib.sha256(KEY.encode()).hexdigest()
    )
    db.add(
        IssReference(data_month=OCT, version="iss-est test", dataset_id="x", carriers=1, tables={})
    )
    db.flush()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_partner_iss_service] = lambda: PartnerIssService(db, loads)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    limiter.reset()


def saved(db: Session, usdot: int, value: int | None, month: date) -> None:
    carrier = db.scalar(select(Carrier).where(Carrier.usdot_number == usdot)) or make_carrier(
        db, usdot
    )
    db.add(
        IssSnapshot(
            carrier_id=carrier.id,
            value=value,
            band="INSPECT",
            group=1,
            algorithm="SAFETY",
            reason="test",
            data_month=month,
            version="iss-est test",
            basics=[],
            created_at=datetime.now(UTC),
        )
    )
    db.flush()


def fake_estimate(value: int):
    """iss_for as the app has it: calculates, and saves the new score."""

    def iss_for(db: Session, usdot: int) -> EstimatedIssOut:
        saved(db, usdot, value, OCT)
        return EstimatedIssOut(
            value=value,
            band="INSPECT",
            group=1,
            reason="test",
            basics=[],
            data_month=OCT,
            version="iss-est test",
        )

    return iss_for


def test_a_key_is_required(api: TestClient) -> None:
    assert api.get("/api/v1/partner/iss/2465630").status_code == 401
    assert api.get("/api/v1/partner/iss/2465630", headers={"X-Api-Key": "wrong"}).status_code == 401


def test_a_saved_score_is_returned_without_fetching(
    api: TestClient, db: Session, loads: Loads
) -> None:
    saved(db, 2465630, 96, OCT)

    answer = api.get("/api/v1/partner/iss/2465630", headers=HEADERS)

    assert answer.status_code == 200
    assert answer.json() == {"usdot_number": 2465630, "month": "2026-10", "estimated_iss": 96}
    assert loads.fetched == []  # already calculated: nothing fetched from FMCSA


def test_a_missing_score_is_calculated_and_saved(
    api: TestClient, db: Session, loads: Loads, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(partner_iss, "iss_for", fake_estimate(68))

    answer = api.get("/api/v1/partner/iss/2814323", headers=HEADERS)

    assert answer.json() == {"usdot_number": 2814323, "month": "2026-10", "estimated_iss": 68}
    assert loads.fetched == [2814323]
    assert db.scalar(select(func.count()).select_from(IssSnapshot)) == 1

    # The second request reads it from the database.
    api.get("/api/v1/partner/iss/2814323", headers=HEADERS)
    assert loads.fetched == [2814323]


def test_an_earlier_month_is_returned_when_saved(api: TestClient, db: Session) -> None:
    saved(db, 2465630, 99, SEP)
    answer = api.get("/api/v1/partner/iss/2465630?month=2026-09", headers=HEADERS)
    assert answer.json()["estimated_iss"] == 99


def test_an_earlier_month_that_was_never_saved_cannot_be_calculated(
    api: TestClient, loads: Loads
) -> None:
    answer = api.get("/api/v1/partner/iss/2465630?month=2026-08", headers=HEADERS)
    assert answer.status_code == 404
    assert loads.fetched == []


def test_a_carrier_fmcsa_does_not_have(api: TestClient) -> None:
    assert api.get("/api/v1/partner/iss/404404", headers=HEADERS).status_code == 404


def test_a_score_fmcsa_data_cannot_support_is_null(
    api: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    saved(db, 2465630, None, OCT)
    assert api.get("/api/v1/partner/iss/2465630", headers=HEADERS).json()["estimated_iss"] is None


@pytest.mark.parametrize("month", ["2026-13", "2026-1", "October"])
def test_a_bad_month_is_refused(api: TestClient, month: str) -> None:
    assert api.get(f"/api/v1/partner/iss/2465630?month={month}", headers=HEADERS).status_code == 422
