"""Job status API and "refresh now" (requires TEST_DATABASE_URL)."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app
from app.repositories.job_repository import JobRepository


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_refresh_now_queues_one_job(api: TestClient) -> None:
    first = api.post("/api/v1/carriers/295017/refresh")

    assert first.status_code == 202
    body = first.json()
    assert body["queued"] is True
    job = body["job"]
    assert (job["job_type"], job["status"], job["payload"]) == (
        "refresh_carrier",
        "QUEUED",
        {"usdot_number": 295017, "force": True},
    )

    again = api.post("/api/v1/carriers/295017/refresh").json()
    assert again["queued"] is False  # already waiting: the same job is returned
    assert again["job"]["id"] == job["id"]
    assert api.get(f"/api/v1/jobs/{job['id']}").json()["status"] == "QUEUED"


def test_overview_counts_and_worker_status(api: TestClient, db: Session) -> None:
    api.post("/api/v1/carriers/295017/refresh")
    api.post("/api/v1/carriers/297080/refresh")

    overview = api.get("/api/v1/jobs").json()
    assert overview["counts"] == {"QUEUED": 2, "RUNNING": 0, "SUCCEEDED": 0, "FAILED": 0}
    assert [j["payload"]["usdot_number"] for j in overview["jobs"]] == [297080, 295017]
    assert overview["worker_running"] is False  # no worker has checked in

    now = datetime.now(UTC)
    JobRepository(db).beat("host:1", now - timedelta(hours=1), now)
    overview = api.get("/api/v1/jobs").json()
    assert overview["worker_running"] is True
    assert overview["workers"][0]["worker"] == "host:1"

    JobRepository(db).beat("host:1", now, now - timedelta(minutes=5))  # went quiet
    assert api.get("/api/v1/jobs").json()["worker_running"] is False

    assert api.get("/api/v1/jobs", params={"status": "FAILED"}).json()["jobs"] == []


def test_unknown_job_and_bad_input(api: TestClient) -> None:
    assert api.get("/api/v1/jobs/999999").status_code == 404
    assert api.get("/api/v1/jobs", params={"status": "DONE"}).status_code == 422
    assert api.post("/api/v1/carriers/0/refresh").status_code == 422
