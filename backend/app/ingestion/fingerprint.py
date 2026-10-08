"""Payload fingerprints for change detection (raw_records.payload_hash, spec Section 19.3)."""

import hashlib
import json
from typing import Any


def payload_hash(payload: dict[str, Any]) -> str:
    """SHA-256 hex of the payload's canonical JSON, so key order never changes the hash."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
