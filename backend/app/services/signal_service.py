"""Run the intelligence rules for a carrier and save their signals (spec Sections 12, 13).

Every signal must carry at least one evidence row (spec 13.2): a rule that returns one without
evidence is a bug, so the whole run stops before anything is saved.
"""

import logging
from collections.abc import Callable, Sequence
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.exceptions import CarrierIQError
from app.intelligence.base_rule import Rule, RuleContext
from app.intelligence.rules.authority_change import AuthorityChangeRule
from app.intelligence.rules.insurance_change import InsuranceChangeRule
from app.intelligence.rules.shared_vin import SharedVinRule
from app.models import Carrier
from app.repositories.signal_repository import SignalRepository

logger = logging.getLogger(__name__)


class MissingEvidenceError(CarrierIQError):
    code = "signal_without_evidence"


def default_rules() -> list[Rule]:
    return [AuthorityChangeRule(), InsuranceChangeRule(), SharedVinRule()]


class SignalService:
    def __init__(
        self,
        db: Session,
        signals: SignalRepository,
        rules: Sequence[Rule],
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.db = db
        self.signals = signals
        self.rules = rules
        self.now = now

    def rebuild(self, carrier: Carrier) -> dict[str, tuple[int, int]]:
        """Re-run every rule; returns {rule_id: (new signals, ended signals)}."""
        now = self.now()
        context = RuleContext(self.db, carrier, now.date())
        found = {rule.rule_id: rule.evaluate(context) for rule in self.rules}
        for rule_id, signals in found.items():
            for signal in signals:
                if not signal.evidence:
                    raise MissingEvidenceError(
                        f"Rule {rule_id} produced signal {signal.signal_key!r} without evidence"
                    )

        results = {
            rule.rule_id: self.signals.sync(
                carrier.id, rule.rule_id, rule.rule_version, found[rule.rule_id], now
            )
            for rule in self.rules
        }
        self.db.commit()
        logger.info(
            "USDOT %d signals: %s",
            carrier.usdot_number,
            ", ".join(f"{r}={len(found[r])}" for r in found) or "no rules",
        )
        return results


def build_signal_service(db: Session) -> SignalService:
    return SignalService(db, SignalRepository(db), default_rules())
