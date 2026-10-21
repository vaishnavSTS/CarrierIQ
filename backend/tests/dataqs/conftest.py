"""Fixtures for the DataQs API tests: a client with a verified carrier, STS staff, and an
in-memory evidence store in place of the bucket."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app
from app.models import User
from app.services.dataqs_evidence_storage import get_evidence_storage
from tests.dataqs.helpers import MemoryStorage, build_world


@pytest.fixture
def storage() -> MemoryStorage:
    return MemoryStorage()


@pytest.fixture
def api(db: Session, real_auth: None, storage: MemoryStorage) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_evidence_storage] = lambda: storage
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def world(db: Session) -> dict[str, User]:
    return build_world(db)
