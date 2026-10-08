"""Carrier search response (spec Section 5.1 "Search result", Section 21)."""

from datetime import datetime

from pydantic import BaseModel

from app.services.carrier_search_query import SearchKind


class DocketOut(BaseModel):
    prefix: str
    number: str
    status: str | None


class CarrierSearchResult(BaseModel):
    usdot_number: int
    legal_name: str
    dba_name: str | None
    dockets: list[DocketOut]
    # ACTIVE when any docket is active; otherwise the first docket's status; None: no dockets.
    authority_status: str | None
    registration_status: str | None
    insurance_status: str | None = None  # insurance data arrives in Phase 6
    review_status: str | None = None  # intelligence signals arrive in Phase 8
    fleet_size: int | None
    city: str | None
    state: str | None
    last_refreshed_at: datetime | None
    # False: found only in the live source and not saved yet (opening the carrier loads it).
    loaded: bool
    # True: a refresh was due but the source failed, so stored data is shown.
    stale: bool = False


class CarrierSearchResponse(BaseModel):
    query: str
    query_type: SearchKind
    results: list[CarrierSearchResult]
