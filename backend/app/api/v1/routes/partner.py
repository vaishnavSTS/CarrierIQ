"""The partner API: other systems ask about a carrier with their API key.

    GET /api/v1/partner/iss/{usdot_number}?month=YYYY-MM
    X-Api-Key: <the partner's key>

`month` is optional; without it the answer is for the newest FMCSA month (normally last month).

Score Card Sharing API: the carrier's full Safety Score Report as a PDF, exactly as the app
prints it (services/report_render.py). The first report for a carrier also loads it from FMCSA.

    GET /api/v1/partner/score-card/{usdot_number}
    X-Api-Key: <the partner's key>

Keys are given out by STS (python -m app.workers.new_partner_key) and only their SHA-256 hashes
are kept, in PARTNER_API_KEY_HASHES. Each key may ask 60 times a minute, of which 10 reports.
"""

import hashlib
import hmac
import logging
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Response
from sqlalchemy.orm import Session

from app.api.v1.routes.carriers import Refresh
from app.core.config import get_settings
from app.core.exceptions import CarrierNotFoundError, UnauthorizedError, ValidationError
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.schemas.partner import PartnerIssOut
from app.services.partner_iss import PartnerIssService
from app.services.report_render import ReportRenderer, get_report_renderer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/partner", tags=["partner"])

REQUESTS_PER_KEY = (60, 60.0)
REPORTS_PER_KEY = (10, 60.0)  # each report prints a page in a browser


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


@router.get(
    "/score-card/{usdot_number}",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}, "description": "The report as a PDF"}},
)
def score_card(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    key: Annotated[str, Depends(require_partner_key)],
    refresh: Refresh,
    renderer: Annotated[ReportRenderer, Depends(get_report_renderer)],
) -> Response:
    """Score Card Sharing API: the carrier's Safety Score Report as a PDF (404 if FMCSA has no
    such USDOT number)."""
    if get_settings().rate_limit_enabled:
        limit, window = REPORTS_PER_KEY
        limiter.hit(f"partner-report:{key}", limit, window)
    if refresh.ensure_fresh(usdot_number).carrier is None:
        raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number} in FMCSA data")
    pdf = renderer.render(usdot_number)
    logger.info("Score card for USDOT %s sent to partner key %s", usdot_number, key[:8])
    name = f"safety-score-report-{usdot_number}-{date.today().isoformat()}.pdf"
    return Response(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
        },
    )
