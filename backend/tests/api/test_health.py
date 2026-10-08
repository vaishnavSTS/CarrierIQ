from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.api.v1.routes.health import get_health_service
from app.main import app
from app.services.health_service import HealthService


class FakeHealthRepository:
    def __init__(self, fail: bool) -> None:
        self.fail = fail

    def ping(self) -> None:
        if self.fail:
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))


def use_repository(fail: bool) -> None:
    app.dependency_overrides[get_health_service] = lambda: HealthService(
        FakeHealthRepository(fail)  # type: ignore[arg-type]
    )


def test_health_ok_when_database_reachable(client: TestClient) -> None:
    use_repository(fail=False)

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_degraded_when_database_unreachable(client: TestClient) -> None:
    use_repository(fail=True)

    response = client.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unavailable"}


def test_response_carries_request_id(client: TestClient) -> None:
    use_repository(fail=False)

    response = client.get("/api/v1/health", headers={"X-Request-ID": "abc123"})

    assert response.headers["X-Request-ID"] == "abc123"
