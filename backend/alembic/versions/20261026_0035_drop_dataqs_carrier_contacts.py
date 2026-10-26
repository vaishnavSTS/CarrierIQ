"""drop dataqs_carrier_contacts: the FMCSA Credentials feature was removed

Deletes every saved carrier contact (FMCSA account email, phone, encrypted password).
The downgrade recreates the empty table only; the deleted rows cannot be restored.

Revision ID: 0035
Revises: 0034
Create Date: 2026-10-26 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0035"
down_revision: str | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(
        op.f("ix_dataqs_carrier_contacts_organization_id"), table_name="dataqs_carrier_contacts"
    )
    op.drop_table("dataqs_carrier_contacts")


def downgrade() -> None:
    op.create_table(
        "dataqs_carrier_contacts",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("organization_id", sa.BigInteger(), nullable=False),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column("password_encrypted", sa.Text(), nullable=True),
        sa.Column("updated_by_id", sa.BigInteger(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_dataqs_carrier_contacts_organization_id_organizations"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"],
            ["users.id"],
            name=op.f("fk_dataqs_carrier_contacts_updated_by_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dataqs_carrier_contacts")),
        sa.UniqueConstraint(
            "organization_id", "usdot_number", name="uq_dataqs_carrier_contacts_org_usdot"
        ),
    )
    op.create_index(
        op.f("ix_dataqs_carrier_contacts_organization_id"),
        "dataqs_carrier_contacts",
        ["organization_id"],
        unique=False,
    )
