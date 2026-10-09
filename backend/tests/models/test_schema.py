"""Schema rules from spec Section 11, checked on the model metadata (no database needed)."""

from sqlalchemy import CheckConstraint, Enum

import app.models  # noqa: F401  (registers every model on Base.metadata)
from app.db.base import Base

TABLES = {
    # Raw
    "raw_records",
    # Canonical
    "carriers",
    "addresses",
    "phones",
    "officers",
    "domains",
    "authority",
    "insurance",
    "inspections",
    "crashes",
    "vehicles",
    # History
    "authority_history",
    "carrier_attribute_history",
    "carrier_snapshots",
    "identity_events",
    # Derived
    "intelligence_signals",
    "signal_evidence",
    "timeline_events",
    "relationships",
    # Operational
    "ingestion_runs",
    "jobs",
    "worker_heartbeats",
}

# Rows in these tables always come from a source record (Engineering Principle 5).
SOURCE_TRACED_TABLES = {
    "addresses",
    "phones",
    "officers",
    "domains",
    "authority",
    "insurance",
    "inspections",
    "crashes",
    "carrier_attribute_history",
    "carrier_snapshots",
    "authority_history",
}

# History rows are never updated in place (Section 20).
APPEND_ONLY_TABLES = {
    "raw_records",
    "carrier_attribute_history",
    "carrier_snapshots",
    "authority_history",
}


def test_every_spec_table_is_modelled() -> None:
    assert set(Base.metadata.tables) == TABLES


def test_every_table_has_id_and_created_at() -> None:
    for table in Base.metadata.tables.values():
        assert "id" in table.c, table.name
        assert table.c.id.primary_key, table.name
        assert "created_at" in table.c, table.name


def test_source_traced_tables_point_back_to_raw_records() -> None:
    for name in SOURCE_TRACED_TABLES:
        table = Base.metadata.tables[name]
        assert not table.c.source.nullable, name
        assert not table.c.raw_record_id.nullable, name
        targets = {fk.target_fullname for fk in table.c.raw_record_id.foreign_keys}
        assert targets == {"raw_records.id"}, name


def test_append_only_tables_have_no_updated_at() -> None:
    for name in APPEND_ONLY_TABLES:
        assert "updated_at" not in Base.metadata.tables[name].c, name


def test_confidence_and_severity_use_the_fixed_scales() -> None:
    for table in Base.metadata.tables.values():
        for column_name, allowed in (
            ("confidence", ["HIGH", "MEDIUM", "LOW"]),
            ("severity", ["INFO", "LOW", "MEDIUM", "HIGH"]),
        ):
            if column_name in table.c:
                column_type = table.c[column_name].type
                assert isinstance(column_type, Enum), f"{table.name}.{column_name}"
                assert column_type.enums == allowed, f"{table.name}.{column_name}"
                assert column_type.create_constraint, f"{table.name}.{column_name}"


def test_history_period_is_validated() -> None:
    table = Base.metadata.tables["carrier_attribute_history"]
    names = {c.name for c in table.constraints if isinstance(c, CheckConstraint)}
    assert "ck_carrier_attribute_history_valid_period" in names
