"""Database fixtures for model tests.

Database tests run only when TEST_DATABASE_URL is set. They build the schema inside a
throwaway PostgreSQL schema (`pytest_models`) and roll back every test, so they never touch
application tables, even when pointed at a shared database.
"""

import hashlib
import json
import os
from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.db.base import Base
from app.models import Carrier, RawRecord

TEST_SCHEMA = "pytest_models"


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
        Base.metadata.create_all(connection)

    yield engine

    with engine.begin() as connection:
        connection.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
    engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """A session whose work is rolled back after the test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


def make_raw_record(db: Session, external_id: str = "1234567", **payload: Any) -> RawRecord:
    payload = payload or {"dot_number": external_id}
    record = RawRecord(
        source="dot_socrata",
        dataset_id="az4n-8mr2",
        external_id=external_id,
        payload=payload,
        payload_hash=hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
    )
    db.add(record)
    db.flush()
    return record


def make_carrier(
    db: Session, usdot_number: int = 1234567, legal_name: str = "ACME TRUCKING LLC"
) -> Carrier:
    carrier = Carrier(usdot_number=usdot_number, legal_name=legal_name)
    db.add(carrier)
    db.flush()
    return carrier
