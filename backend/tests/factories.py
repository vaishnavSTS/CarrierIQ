"""Builders for test rows."""

import hashlib
import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import Carrier, RawRecord


def make_raw_record(db: Session, external_id: str = "1234567", **payload: Any) -> RawRecord:
    payload = payload or {"dot_number": external_id}
    record = RawRecord(
        source="dot_socrata",
        dataset_id="az4n-8mr2",
        external_id=external_id,
        payload=payload,
        payload_hash=hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
    )
    db.add(record)
    db.flush()
    return record


def make_carrier(
    db: Session, usdot_number: int = 1234567, legal_name: str = "ACME TRUCKING LLC"
) -> Carrier:
    carrier = Carrier(usdot_number=usdot_number, legal_name=legal_name)
    db.add(carrier)
    db.flush()
    return carrier
