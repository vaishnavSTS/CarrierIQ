"""compliance requests: clients asking STS for help with a compliance service (Compliance tab)

Revision ID: 0037
Revises: 0036
Create Date: 2026-10-26 16:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0037"
down_revision: str | None = "0036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SERVICES = (
    "DOT_MC_AUTHORITY",
    "UCR",
    "CA_MCP",
    "DRUG_ALCOHOL",
    "DRIVER_FILES",
    "MVR",
    "BACKGROUND_CHECK",
    "GOOD_STANDING",
    "CLEARINGHOUSE",
)


def upgrade() -> None:
    op.create_table(
        "compliance_requests",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("organization_id", sa.BigInteger(), nullable=False),
        sa.Column("usdot_number", sa.BigInteger(), nullable=False),
        sa.Column(
            "service",
            sa.Enum(
                *SERVICES,
                name="compliance_service",
                native_enum=False,
                create_constraint=True,
                length=30,
            ),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "OPEN",
                "HANDLED",
                name="compliance_request_status",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("requested_by_id", sa.BigInteger(), nullable=False),
        sa.Column("handled_by_id", sa.BigInteger(), nullable=True),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("email_error", sa.Text(), nullable=True),
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
            name=op.f("fk_compliance_requests_organization_id_organizations"),
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_id"],
            ["users.id"],
            name=op.f("fk_compliance_requests_requested_by_id_users"),
        ),
        sa.ForeignKeyConstraint(
            ["handled_by_id"],
            ["users.id"],
            name=op.f("fk_compliance_requests_handled_by_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_compliance_requests")),
    )
    op.create_index(
        op.f("ix_compliance_requests_organization_id"),
        "compliance_requests",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_compliance_requests_usdot_number"),
        "compliance_requests",
        ["usdot_number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_compliance_requests_usdot_number"), table_name="compliance_requests")
    op.drop_index(op.f("ix_compliance_requests_organization_id"), table_name="compliance_requests")
    op.drop_table("compliance_requests")
