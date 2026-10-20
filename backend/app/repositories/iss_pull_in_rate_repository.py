from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import IssPullInRate
from app.services.pull_in import RateRow


class IssPullInRateRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def rows(self) -> list[RateRow]:
        """Every state's pull-in rate for every ISS range, lowest range first."""
        return [
            RateRow(
                state=r.state_code,
                min_score=r.min_score,
                max_score=r.max_score,
                percent=r.pull_in_percent,
                source=r.source,
                effective_date=r.effective_date,
            )
            for r in self.db.scalars(
                select(IssPullInRate).order_by(IssPullInRate.min_score, IssPullInRate.state_code)
            )
        ]
