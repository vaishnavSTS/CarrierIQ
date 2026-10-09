"""safety records: crash detail, SMS results, BOC-3 process agents

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-09 20:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]


def _trace(table: str) -> list[sa.Column | sa.Constraint]:
    return [
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("raw_record_id", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["carrier_id"],
            ["carriers.id"],
            name=op.f(f"fk_{table}_carrier_id_carriers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["raw_record_id"],
            ["raw_records.id"],
            name=op.f(f"fk_{table}_raw_record_id_raw_records"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
    ]


def upgrade() -> None:
    # crashes: one row per report per carrier (a report can involve several carriers).
    op.add_column("crashes", sa.Column("city", sa.String(length=100), nullable=True))
    op.add_column(
        "crashes",
        sa.Column("hazmat_released", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "crashes", sa.Column("vehicles", sa.Integer(), server_default="1", nullable=False)
    )
    op.drop_constraint("uq_crashes_source_crash_id", "crashes", type_="unique")
    op.create_unique_constraint(
        "uq_crashes_source_crash_id_carrier", "crashes", ["source", "crash_id", "carrier_id"]
    )

    op.create_table(
        "sms_results",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("carrier_id", sa.BigInteger(), nullable=False),
        sa.Column("snapshot_month", sa.Date(), nullable=False),
        sa.Column("dataset_id", sa.String(length=20), nullable=False),
        sa.Column("dataset", sa.String(length=50), nullable=False),
        sa.Column("passenger", sa.Boolean(), nullable=False),
        sa.Column("inspections", sa.Integer(), nullable=False),
        sa.Column("driver_inspections", sa.Integer(), nullable=False),
        sa.Column("vehicle_inspections", sa.Integer(), nullable=False),
        sa.Column("basic", sa.String(length=20), nullable=False),
        sa.Column("label", sa.String(length=60), nullable=False),
        sa.Column("inspections_with_violation", sa.Integer(), nullable=False),
        sa.Column("measure", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("percentile", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("over_threshold", sa.Boolean(), nullable=True),
        sa.Column("alert", sa.Boolean(), nullable=True),
        sa.Column("acute_critical", sa.Boolean(), nullable=True),
        sa.Column("note", sa.String(length=200), nullable=True),
        *_trace("sms_results"),
        *_timestamps(),
        sa.UniqueConstraint("carrier_id", "snapshot_month", "basic", name="uq_sms_results_month"),
    )
    op.create_index(op.f("ix_sms_results_carrier_id"), "sms_results", ["carrier_id"])
    op.create_index(op.f("ix_sms_results_raw_record_id"), "sms_results", ["raw_record_id"])

    op.create_table(
        "process_agents",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("carrier_id", sa.BigInteger(), nullable=False),
        sa.Column("docket", sa.String(length=20), server_default="", nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("attention", sa.String(length=200), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=10), nullable=True),
        sa.Column("source_system", sa.String(length=20), nullable=False),
        sa.Column("first_seen", sa.Date(), nullable=False),
        sa.Column("last_seen", sa.Date(), nullable=False),
        sa.Column("is_current", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_trace("process_agents"),
        *_timestamps(),
        sa.UniqueConstraint(
            "carrier_id", "source_system", "docket", "name", name="uq_process_agents_agent"
        ),
    )
    op.create_index(op.f("ix_process_agents_carrier_id"), "process_agents", ["carrier_id"])
    op.create_index(op.f("ix_process_agents_raw_record_id"), "process_agents", ["raw_record_id"])


def downgrade() -> None:
    op.drop_table("process_agents")
    op.drop_table("sms_results")
    op.drop_constraint("uq_crashes_source_crash_id_carrier", "crashes", type_="unique")
    op.create_unique_constraint("uq_crashes_source_crash_id", "crashes", ["source", "crash_id"])
    op.drop_column("crashes", "vehicles")
    op.drop_column("crashes", "hazmat_released")
    op.drop_column("crashes", "city")
