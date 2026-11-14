"""REDIRECT_TO: the retired Render copy sends every request to the live site."""

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app, create_redirect_app

TARGET = "https://carriersafetyscan.com"


@pytest.fixture
def moved() -> TestClient:
    return TestClient(create_redirect_app(TARGET + "/"), follow_redirects=False)


def test_get_keeps_path_and_query(moved: TestClient) -> None:
    response = moved.get("/api/v1/partner/score-card/1234567?format=pdf")

    assert response.status_code == 308
    assert response.headers["location"] == f"{TARGET}/api/v1/partner/score-card/1234567?format=pdf"


def test_post_is_redirected_with_308_so_the_method_is_kept(moved: TestClient) -> None:
    response = moved.post("/api/v1/webhooks/twilio/sms", data={"Body": "123456"})

    assert response.status_code == 308
    assert response.headers["location"] == f"{TARGET}/api/v1/webhooks/twilio/sms"


def test_root_and_pages(moved: TestClient) -> None:
    assert moved.get("/").headers["location"] == f"{TARGET}/"
    assert moved.get("/carriers/123").headers["location"] == f"{TARGET}/carriers/123"


def test_health_still_answers_so_the_host_keeps_it_up(moved: TestClient) -> None:
    response = moved.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "moved", "location": TARGET}


def test_create_app_redirects_only_when_redirect_to_is_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "redirect_to", TARGET)
    response = TestClient(create_app(), follow_redirects=False).get("/api/v1/carriers")
    assert response.status_code == 308

    monkeypatch.setattr(get_settings(), "redirect_to", None)
    response = TestClient(create_app(), follow_redirects=False).get("/api/v1/carriers")
    assert response.status_code != 308
