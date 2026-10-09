"""Re-run the intelligence rules for loaded carriers, from stored data only (no source fetches).

Signals are rebuilt on every carrier refresh; use this after adding or changing a rule.

    python -m app.workers.rebuild_signals            # every loaded carrier
    python -m app.workers.rebuild_signals 295017     # only these USDOT numbers
"""

import logging
import sys

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Carrier
from app.services.signal_service import build_signal_service

logger = logging.getLogger(__name__)


def main(usdot_numbers: list[int]) -> None:
    with SessionLocal() as db:
        query = select(Carrier).order_by(Carrier.usdot_number)
        if usdot_numbers:
            query = query.where(Carrier.usdot_number.in_(usdot_numbers))
        service = build_signal_service(db)
        for carrier in db.scalars(query).all():
            results = service.rebuild(carrier)
            print(f"USDOT {carrier.usdot_number}: {results}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main([int(arg) for arg in sys.argv[1:]])
