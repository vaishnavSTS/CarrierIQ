"""Shared fixtures.

Database tests run only when TEST_DATABASE_URL is set. They build the schema inside a
throwaway PostgreSQL schema (`pytest_models`) and roll back every test, so they never touch
application tables, even when pointed at a shared database.
"""

import os
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.db.base import Base
from app.main import app

TEST_SCHEMA = "pytest_models"


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set; skipping database tests")

    engine = create_engine(url)

    @event.listens_for(engine, "connect")
    def use_test_schema(dbapi_connection: Any, _: Any) -> None:
        # "extensions" is where Supabase installs pg_trgm; harmless where it doesn't exist.
        with dbapi_connection.cursor() as cursor:
            cursor.execute(f"SET search_path TO {TEST_SCHEMA}, public, extensions")

    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        connection.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
        connection.execute(text(f"CREATE SCHEMA {TEST_SCHEMA}"))
        # checkfirst=False: the app's own tables in `public` are also on the search path, and
        # create_all would otherwise see them, skip creating ours, and test against them.
        Base.metadata.create_all(connection, checkfirst=False)
        current = connection.execute(text("SELECT current_schema()")).scalar()
        assert current == TEST_SCHEMA, f"tests would run in {current!r}"

    yield engine

    with engine.begin() as connection:
        connection.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
    engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """A session whose work, including commits, is rolled back after the test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()
