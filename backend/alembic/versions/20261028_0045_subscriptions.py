"""subscriptions: the 14-day trial and the $25/month Stripe subscription on each login

Existing accounts get no trial end (NULL), so they stay free.

Revision ID: 0045
Revises: 0044
Create Date: 2026-10-28 20:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0045"
down_revision: str | None = "0044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("trial_ends_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("subscription_status", sa.String(30)))
    op.add_column("users", sa.Column("subscription_period_end", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(64)))
    op.add_column("users", sa.Column("stripe_subscription_id", sa.String(64)))
    op.create_index(
        op.f("ix_users_stripe_subscription_id"), "users", ["stripe_subscription_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_stripe_subscription_id"), table_name="users")
    for column in (
        "stripe_subscription_id",
        "stripe_customer_id",
        "subscription_period_end",
        "subscription_status",
        "trial_ends_at",
    ):
        op.drop_column("users", column)
