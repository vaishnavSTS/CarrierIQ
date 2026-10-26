"""dataqs agent access: the carrier authorizes STS as an associate in the FMCSA Portal

A fourth way for the carrier to let STS file (AUTHORIZED_AGENT), and the state of STS's access
request on the case.

Revision ID: 0040
Revises: 0039
Create Date: 2026-10-26 22:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0040"
down_revision: str | None = "0039"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_METHODS = ("TEXT", "AI_CALL", "SCHEDULED_CALL")
NEW_METHODS = (*OLD_METHODS, "AUTHORIZED_AGENT")


def _methods_check(methods: tuple[str, ...]) -> None:
    op.drop_constraint(op.f("ck_dataqs_cases_dataqs_otp_method"), "dataqs_cases", type_="check")
    listed = ", ".join(f"'{m}'" for m in methods)
    op.create_check_constraint(
        op.f("ck_dataqs_cases_dataqs_otp_method"), "dataqs_cases", f"otp_method IN ({listed})"
    )


def upgrade() -> None:
    _methods_check(NEW_METHODS)
    op.add_column(
        "dataqs_cases",
        sa.Column(
            "agent_access",
            sa.Enum(
                "REQUESTED",
                "SENT",
                "GRANTED",
                name="dataqs_agent_access",
                native_enum=False,
                create_constraint=True,
                length=20,
            ),
            nullable=True,
        ),
    )
    op.add_column("dataqs_cases", sa.Column("agent_request_sent_at", sa.DateTime(timezone=True)))
    op.add_column("dataqs_cases", sa.Column("agent_request_sent_by_id", sa.BigInteger()))
    op.create_foreign_key(
        op.f("fk_dataqs_cases_agent_request_sent_by_id_users"),
        "dataqs_cases",
        "users",
        ["agent_request_sent_by_id"],
        ["id"],
    )
    op.add_column(
        "dataqs_cases",
        sa.Column("agent_reminders", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("dataqs_cases", sa.Column("agent_reminded_at", sa.DateTime(timezone=True)))
    op.add_column("dataqs_cases", sa.Column("agent_granted_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("dataqs_cases", "agent_granted_at")
    op.drop_column("dataqs_cases", "agent_reminded_at")
    op.drop_column("dataqs_cases", "agent_reminders")
    op.drop_constraint(
        op.f("fk_dataqs_cases_agent_request_sent_by_id_users"), "dataqs_cases", type_="foreignkey"
    )
    op.drop_column("dataqs_cases", "agent_request_sent_by_id")
    op.drop_column("dataqs_cases", "agent_request_sent_at")
    op.drop_column("dataqs_cases", "agent_access")
    op.execute("UPDATE dataqs_cases SET otp_method = NULL WHERE otp_method = 'AUTHORIZED_AGENT'")
    _methods_check(OLD_METHODS)
