"""carrier claims: one carrier account per USDOT number (Claim your company)

Existing carrier accounts keep their numbers: each USDOT already linked to a carrier account is
claimed for the account that linked it first.

Revision ID: 0050
Revises: 0049
Create Date: 2026-11-03 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0050"
down_revision: str | None = "0049"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "carrier_claims",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False, unique=True),
        sa.Column(
            "organization_id",
            sa.BigInteger(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "claimed_by_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("company_name", sa.String(200), nullable=False),
        sa.Column("contact_name", sa.String(200), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute(
        """
        INSERT INTO carrier_claims
            (usdot_number, organization_id, claimed_by_id, company_name, contact_name, created_at)
        SELECT DISTINCT ON (oc.usdot_number)
            oc.usdot_number, o.id, u.id, o.name, u.full_name, oc.created_at
        FROM organization_carriers oc
        JOIN organizations o ON o.id = oc.organization_id AND o.kind = 'CLIENT'
        LEFT JOIN LATERAL (
            SELECT id, full_name FROM users WHERE organization_id = o.id ORDER BY id LIMIT 1
        ) u ON true
        ORDER BY oc.usdot_number, oc.created_at, oc.id
        """
    )


def downgrade() -> None:
    op.drop_table("carrier_claims")
