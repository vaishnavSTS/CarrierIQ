"""The partner API: other systems ask for a carrier's Estimated ISS with their API key.

    GET /api/v1/partner/iss/{usdot_number}?month=YYYY-MM
    X-Api-Key: <the partner's key>

`month` is optional; without it the answer is for the newest FMCSA month (normally last month).
Keys are given out by STS (python -m app.workers.new_partner_key) and only their SHA-256 hashes
are kept, in PARTNER_API_KEY_HASHES. Each key may ask 60 times a minute.
"""

import hashlib
import hmac
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import Refresh
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError, ValidationError
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.schemas.partner import PartnerIssOut
from app.services.partner_iss import PartnerIssService

router = APIRouter(prefix="/partner", tags=["partner"])

REQUESTS_PER_KEY = (60, 60.0)


def key_hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def require_partner_key(x_api_key: Annotated[str | None, Header()] = None) -> str:
    """The calling partner, known by its key's hash; 401 without a key we gave out."""
    allowed = [
        h.strip().lower() for h in get_settings().partner_api_key_hashes.split(",") if h.strip()
    ]
    given = key_hash(x_api_key) if x_api_key else ""
    if not given or not any(hmac.compare_digest(given, h) for h in allowed):
        raise UnauthorizedError("A valid X-Api-Key header is required")
    if get_settings().rate_limit_enabled:
        limit, window = REQUESTS_PER_KEY
        limiter.hit(f"partner:{given}", limit, window)
    return given


def get_partner_iss_service(
    db: Annotated[Session, Depends(get_db)], refresh: Refresh
) -> PartnerIssService:
    return PartnerIssService(db, lambda usdot: refresh.ensure_fresh(usdot).carrier)


@router.get("/iss/{usdot_number}", response_model=PartnerIssOut)
def partner_iss(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    _: Annotated[str, Depends(require_partner_key)],
    service: Annotated[PartnerIssService, Depends(get_partner_iss_service)],
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
) -> PartnerIssOut:
    """The carrier's Estimated ISS for the month: the saved score, or calculated and saved now."""
    wanted = None
    if month is not None:
        year, number = (int(part) for part in month.split("-"))
        if not 1 <= number <= 12:
            raise ValidationError("month must be YYYY-MM")
        wanted = date(year, number, 1)
    return service.score(usdot_number, wanted)
