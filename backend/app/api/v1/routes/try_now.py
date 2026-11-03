"""Try Now: a visitor with no account looks up one carrier, one time only.

POST /try/start spends the visitor's one search, for good: it is stored against a keyed hash of
their address (table try_uses) and marked in their browser with a long-lived cookie, and either one
blocks them from then on, even for the same carrier. It also sets a short pass naming that USDOT,
so they can read every tab of it during this visit: the same carrier routes a broker has, answering
only for the USDOT in the pass, with no STS-internal data.

POST /try/find looks a carrier up by MC number or company name so the visitor can pick one. It
doesn't use the search up, so it only answers with what tells carriers apart, passes the same bot
checks, has its own limit and stops once the search is used.
"""

import hashlib
import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.api.bot_protection import client_ip, require_human
from app.api.v1.routes.carriers import (
    get_carrier_profile_service,
    get_carrier_search_service,
    get_chameleon_service,
)
from app.api.v1.routes.portal import add_carrier_routes
from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, TryLimitReachedError
from app.core.rate_limit import limiter
from app.core.security import create_purpose_token, read_purpose_token
from app.db.session import get_db
from app.models import TryUse
from app.schemas.carrier_profile import CarrierProfile
from app.schemas.chameleon import ChameleonOut
from app.services.carrier_profile_service import CarrierProfileService
from app.services.carrier_search_service import CarrierSearchService
from app.services.chameleon_service import ChameleonService
from app.services.client_view import client_profile

router = APIRouter(prefix="/try", tags=["try"])

TRY_COOKIE = "carrieriq_try"  # the pass for this visit
USED_COOKIE = "carrieriq_try_used"  # this browser has had its search
TRY_PURPOSE = "try_now"
TRY_MINUTES = 30
USED_COOKIE_SECONDS = 400 * 86_400  # the longest browsers keep a cookie
LOOKUPS_PER_IP = (10, 3600.0)  # each lookup can fetch from FMCSA, including ones not found
FINDS_PER_IP = (10, 3600.0)  # a name search reads FMCSA's census, and it costs no search
MAX_MATCHES = 10
USED_UP = "You've used your free search. Sign up for a 30-day free trial to see more."

ProfileService = Annotated[CarrierProfileService, Depends(get_carrier_profile_service)]


class TryStartIn(BaseModel):
    usdot_number: int = Field(gt=0, lt=100_000_000)


class TryFindIn(BaseModel):
    query: str = Field(min_length=1, max_length=100)


class TryMatch(BaseModel):
    """Enough to tell carriers apart, and nothing a full account pays for."""

    usdot_number: int
    legal_name: str
    dba_name: str | None
    city: str | None
    state: str | None


class TryUses:
    """Who has had their one search; tests replace it."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def used(self, visitor: str) -> bool:
        return self.db.query(TryUse.id).filter(TryUse.visitor_hash == visitor).first() is not None

    def claim(self, visitor: str, usdot: int) -> bool:
        """Records the search. False when this visitor got there first in another request."""
        inserted = self.db.execute(
            insert(TryUse)
            .values(visitor_hash=visitor, usdot_number=usdot)
            .on_conflict_do_nothing(index_elements=[TryUse.visitor_hash])
            .returning(TryUse.id)
        ).first()
        self.db.commit()
        return inserted is not None


def get_try_uses(db: Annotated[Session, Depends(get_db)]) -> TryUses:
    return TryUses(db)


Uses = Annotated[TryUses, Depends(get_try_uses)]


def _visitor(ip: str) -> str:
    """The address as a keyed hash: enough to know them again, without storing the address."""
    key = get_settings().auth_secret_key.encode()
    return hmac.new(key, f"try-now:{ip}".encode(), hashlib.sha256).hexdigest()


def chosen_carrier(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)], request: Request
) -> int:
    """The USDOT in the visitor's pass for this visit; anything else needs an account."""
    token = request.cookies.get(TRY_COOKIE)
    claims = read_purpose_token(token, TRY_PURPOSE) if token else None
    if not claims or claims.get("usdot") != str(usdot_number):
        raise ForbiddenError(
            "Your free search has been used. Sign up for a 30-day free trial to see more."
        )
    return usdot_number


Chosen = Annotated[int, Depends(chosen_carrier)]


@router.post("/find", response_model=list[TryMatch], dependencies=[Depends(require_human)])
def find(
    data: TryFindIn,
    request: Request,
    search: Annotated[CarrierSearchService, Depends(get_carrier_search_service)],
    uses: Uses,
) -> list[TryMatch]:
    """Carriers matching an MC number or a name. Doesn't use up the search: opening one does."""
    ip = client_ip(request)
    if request.cookies.get(USED_COOKIE) or uses.used(_visitor(ip)):
        raise TryLimitReachedError(USED_UP)
    if get_settings().rate_limit_enabled:
        limit, window = FINDS_PER_IP
        limiter.hit(f"try-find:{ip}", limit, window)
    return [
        TryMatch(
            usdot_number=r.usdot_number,
            legal_name=r.legal_name,
            dba_name=r.dba_name,
            city=r.city,
            state=r.state,
        )
        for r in search.search(data.query).results[:MAX_MATCHES]
    ]


@router.post("/start", response_model=CarrierProfile, dependencies=[Depends(require_human)])
def start(
    data: TryStartIn, request: Request, response: Response, service: ProfileService, uses: Uses
) -> CarrierProfile:
    """Opens the visitor's one free carrier. 429 (try_limit_reached) once they have used it, for
    any carrier; 404 when FMCSA has no such carrier, which doesn't use it up."""
    ip = client_ip(request)
    visitor = _visitor(ip)
    if request.cookies.get(USED_COOKIE) or uses.used(visitor):
        raise TryLimitReachedError(USED_UP)
    if get_settings().rate_limit_enabled:
        limit, window = LOOKUPS_PER_IP
        limiter.hit(f"try-lookup:{ip}", limit, window)
    profile = client_profile(service.get(data.usdot_number))
    if not uses.claim(visitor, data.usdot_number):
        raise TryLimitReachedError(USED_UP)
    secure = get_settings().auth_cookie_secure
    response.set_cookie(
        TRY_COOKIE,
        create_purpose_token({"usdot": str(data.usdot_number)}, TRY_PURPOSE, TRY_MINUTES),
        max_age=TRY_MINUTES * 60,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        USED_COOKIE,
        "1",
        max_age=USED_COOKIE_SECONDS,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    return profile


add_carrier_routes(router, chosen_carrier)


@router.get("/carriers/{usdot_number}/chameleon", response_model=ChameleonOut)
def carrier_chameleon(
    usdot_number: Chosen, service: Annotated[ChameleonService, Depends(get_chameleon_service)]
) -> ChameleonOut:
    return service.get(usdot_number)
