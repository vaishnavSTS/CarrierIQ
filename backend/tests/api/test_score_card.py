"""Score Card Sharing API: a partner asks for a carrier's Safety Score Report as a PDF, and the
bare report page reads the carrier only with a report pass for that one USDOT number."""

import hashlib
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import get_refresh_service, get_socrata_client
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.security import create_purpose_token
from app.db.session import get_db
from app.main import app
from app.services.report_render import (
    ReportUnavailableError,
    get_report_renderer,
    pass_allows,
    report_pass,
)
from tests.api.test_monitored_carriers import KNOWN, UNKNOWN, FakeRefresh
from tests.ingestion.helpers import FakeDotApi, load_inspection_rows
from tests.services.test_carrier_search import UNITED

KEY = "css_test-score-card-key"
HEADERS = {"X-Api-Key": KEY}
SCORE_CARD = "/api/v1/partner/score-card"
UNITED_USDOT = 295017  # UNITED MOVING AND STORAGE INC in the fake FMCSA answers


class FakeRenderer:
    """Stands in for the headless browser; remembers what it printed."""

    def __init__(self, fail: bool = False) -> None:
        self.printed: list[int] = []
        self.fail = fail

    def render(self, usdot_number: int) -> bytes:
        if self.fail:
            raise ReportUnavailableError("The Safety Score Report could not be printed.")
        self.printed.append(usdot_number)
        return b"%PDF-1.7 fake report"


@pytest.fixture
def renderer() -> FakeRenderer:
    return FakeRenderer()


@pytest.fixture
def api(
    db: Session, renderer: FakeRenderer, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    limiter.reset()
    monkeypatch.setattr(
        get_settings(), "partner_api_key_hashes", hashlib.sha256(KEY.encode()).hexdigest()
    )
    refresh = FakeRefresh(db)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_refresh_service] = lambda: refresh
    app.dependency_overrides[get_report_renderer] = lambda: renderer
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    limiter.reset()


def test_a_partner_gets_the_report_as_a_pdf(api: TestClient, renderer: FakeRenderer) -> None:
    response = api.get(f"{SCORE_CARD}/{KNOWN}", headers=HEADERS)

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    disposition = response.headers["content-disposition"]
    assert disposition.startswith(f'attachment; filename="safety-score-report-{KNOWN}-')
    assert response.headers["cache-control"] == "no-store"
    assert renderer.printed == [KNOWN]


def test_no_report_without_a_valid_key(api: TestClient, renderer: FakeRenderer) -> None:
    assert api.get(f"{SCORE_CARD}/{KNOWN}").status_code == 401
    assert api.get(f"{SCORE_CARD}/{KNOWN}", headers={"X-Api-Key": "wrong"}).status_code == 401
    assert renderer.printed == []


def test_unknown_or_impossible_usdot(api: TestClient, renderer: FakeRenderer) -> None:
    assert api.get(f"{SCORE_CARD}/{UNKNOWN}", headers=HEADERS).status_code == 404
    assert api.get(f"{SCORE_CARD}/0", headers=HEADERS).status_code == 422
    assert renderer.printed == []


def test_a_failed_print_says_try_again(db: Session, api: TestClient) -> None:
    app.dependency_overrides[get_report_renderer] = lambda: FakeRenderer(fail=True)

    response = api.get(f"{SCORE_CARD}/{KNOWN}", headers=HEADERS)

    assert response.status_code == 503
    assert "could not be printed" in response.text


def test_ten_reports_a_minute_per_key(
    api: TestClient, renderer: FakeRenderer, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)

    codes = [api.get(f"{SCORE_CARD}/{KNOWN}", headers=HEADERS).status_code for _ in range(11)]

    assert codes == [200] * 10 + [429]


# --- The report pass ------------------------------------------------------------------------------


def test_a_report_pass_names_one_carrier() -> None:
    token = report_pass(KNOWN)
    assert pass_allows(token, KNOWN)
    assert not pass_allows(token, KNOWN + 1)
    assert not pass_allows(None, KNOWN)
    assert not pass_allows("not-a-token", KNOWN)
    # A token made for something else (e.g. finishing a Google sign-up) is no pass.
    other = create_purpose_token({"usdot": str(KNOWN)}, "google_signup", 5)
    assert not pass_allows(other, KNOWN)


@pytest.fixture
def render_api(db: Session, real_auth: None) -> Iterator[TestClient]:
    headers, units = load_inspection_rows()
    fmcsa = FakeDotApi([UNITED], headers, units)

    def fake_client() -> Iterator[Any]:
        yield fmcsa.client()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_socrata_client] = fake_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_the_report_page_reads_its_carrier_with_the_pass(render_api: TestClient) -> None:
    base = f"/api/v1/report-render/carriers/{UNITED_USDOT}"
    with_pass = {"X-Report-Token": report_pass(UNITED_USDOT)}

    profile = render_api.get(base, headers=with_pass)
    assert profile.status_code == 200, profile.text
    assert profile.json()["legal_name"] == "UNITED MOVING AND STORAGE INC"
    for tab in ("safety", "inspections", "authority", "equipment", "network"):
        assert render_api.get(f"{base}/{tab}", headers=with_pass).status_code == 200, tab


def test_the_report_page_reads_nothing_else(render_api: TestClient) -> None:
    other_pass = {"X-Report-Token": report_pass(UNITED_USDOT + 1)}
    base = f"/api/v1/report-render/carriers/{UNITED_USDOT}"

    assert render_api.get(base).status_code == 401
    assert render_api.get(base, headers=other_pass).status_code == 401
    # A pass is not a login anywhere else.
    with_pass = {"X-Report-Token": report_pass(UNITED_USDOT)}
    assert (
        render_api.get(f"/api/v1/broker/carriers/{UNITED_USDOT}", headers=with_pass).status_code
        == 401
    )
    assert render_api.get(f"/api/v1/carriers/{UNITED_USDOT}", headers=with_pass).status_code == 401
