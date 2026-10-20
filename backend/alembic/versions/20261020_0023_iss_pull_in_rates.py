"""iss pull-in rates: each state's weigh-station pull-in rate by ISS range (PrePass table)

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-20 12:00:00
"""

from collections.abc import Sequence
from datetime import date

import sqlalchemy as sa

from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SOURCE = "PrePass state pull-in rates (shared by STS)"
EFFECTIVE = date(2026, 10, 20)

STATES = ("CA", "CO", "DE", "IN", "KY", "MA", "ME", "MN", "NC", "NE", "NV", "PA", "SC", "UT", "WY")
# More states can be added later with a data-only migration: one row per state and range.

# (min ISS, max ISS): percent per state in STATES order; None = no rate given ("—").
RATES: dict[tuple[int, int], tuple[int | None, ...]] = {
    (0, 49): (5, 5, 2, 0, 5, 0, 0, 0, 5, 0, 5, 3, None, None, None),
    (50, 59): (5, 5, 5, 5, 5, 0, 0, 0, 10, 5, 0, 25, 0, 5, 3),
    (60, 64): (5, 5, 5, 5, 5, 0, 0, 0, 10, 5, 0, 25, 0, 5, 3),
    (65, 69): (5, 5, 5, 5, 5, 0, 0, 0, 10, 5, 0, 60, 0, 5, 3),
    (70, 74): (100, 5, 5, 15, 5, 0, 0, 0, 10, 5, 0, 60, 0, 5, 7),
    (75, 79): (100, 5, 5, 25, 5, 5, 50, 5, 10, 5, 5, 60, 5, 5, 7),
    (80, 88): (100, 5, 5, 25, 5, 5, 50, 5, 10, 5, 5, 100, 5, 10, 7),
    (89, 89): (100, 5, 5, 25, 5, 5, 50, 5, 10, 5, 5, 100, 5, 10, 7),
    (90, 90): (100, 5, 10, 100, 100, 10, 100, 10, 50, 10, 10, 100, 10, 10, 10),
    (91, 91): (100, 10, 10, 100, 100, 10, 100, 10, 50, 10, 10, 100, 10, 10, 10),
    (92, 92): (100, 10, 10, 100, 100, 10, 100, 10, 50, 10, 10, 100, 10, 25, 10),
    (93, 93): (100, 10, 15, 100, 100, 10, 100, 10, 50, 15, 10, 100, 10, 25, 15),
}


def upgrade() -> None:
    table = op.create_table(
        "iss_pull_in_rates",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("state_code", sa.String(length=10), nullable=False),
        sa.Column("min_score", sa.SmallInteger(), nullable=False),
        sa.Column("max_score", sa.SmallInteger(), nullable=False),
        sa.Column("pull_in_percent", sa.SmallInteger(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_iss_pull_in_rates")),
        sa.UniqueConstraint("state_code", "min_score", name="uq_iss_pull_in_rates_state_min_score"),
    )
    op.bulk_insert(
        table,
        [
            {
                "state_code": state,
                "min_score": low,
                "max_score": high,
                "pull_in_percent": percent,
                "source": SOURCE,
                "effective_date": EFFECTIVE,
            }
            for (low, high), percents in RATES.items()
            for state, percent in zip(STATES, percents, strict=True)
        ],
    )


def downgrade() -> None:
    op.drop_table("iss_pull_in_rates")
