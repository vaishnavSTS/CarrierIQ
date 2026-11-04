"""no officer links: carriers are no longer linked by an officer's name

Many different people share a name, so a shared officer name doesn't tie two carriers together.
Contact link refreshes no longer make SHARES_OFFICER links (services/contact_link_service.py);
this removes the ones made before, and ends the review signals that rested on them alone. They
were derived from FMCSA's census, so nothing is lost: the census rows they pointed to stay.

Revision ID: 0053
Revises: 0052
Create Date: 2026-11-03 20:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0053"
down_revision: str | None = "0052"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("DELETE FROM relationships WHERE relationship_type = 'SHARES_OFFICER'"))
    # Review signals that rested on an officer's name alone end now, as they would at each
    # carrier's next refresh (rules/shared_contact.py; signals sharing a phone, email or address
    # as well are updated then).
    op.execute(
        sa.text(
            """
            UPDATE intelligence_signals AS s SET is_active = false
            WHERE s.rule_id = 'shared_contact' AND s.is_active
              AND EXISTS (SELECT 1 FROM signal_evidence e WHERE e.signal_id = s.id)
              AND NOT EXISTS (
                SELECT 1 FROM signal_evidence e
                WHERE e.signal_id = s.id AND coalesce(e.field_name, '') <> 'officer'
              )
            """
        )
    )


def downgrade() -> None:
    # The links come back on each carrier's next contact link refresh if matching is restored.
    pass
