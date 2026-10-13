"""users and organizations: login for the client and internal portals

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-13 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column]:  # type: ignore[type-arg]
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


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "STS",
                "CLIENT",
                name="organization_kind",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("organization_id", sa.BigInteger(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("password_hash", sa.String(length=300), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "STS_ADMIN",
                "STS_ANALYST",
                "CLIENT_ADMIN",
                "CLIENT_USER",
                name="user_role",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "ACTIVE",
                "DISABLED",
                name="user_status",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_users_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("ix_users_organization_id"), "users", ["organization_id"])

    op.create_table(
        "organization_carriers",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("organization_id", sa.BigInteger(), nullable=False),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False),
        sa.Column("verified", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_organization_carriers_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organization_carriers")),
        sa.UniqueConstraint(
            "organization_id", "usdot_number", name="uq_organization_carriers_org_usdot"
        ),
    )
    op.create_index(
        op.f("ix_organization_carriers_organization_id"),
        "organization_carriers",
        ["organization_id"],
    )
    op.create_index(
        op.f("ix_organization_carriers_usdot_number"), "organization_carriers", ["usdot_number"]
    )


def downgrade() -> None:
    op.drop_table("organization_carriers")
    op.drop_table("users")
    op.drop_table("organizations")
