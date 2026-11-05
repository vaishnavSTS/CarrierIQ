"""The carrier map on the public audience pages: interstate carriers by state, active or
inactive (`status`), with no login (services/carrier_directory.py).

Every state's totals, and for a state its newest, largest or A-Z carriers, PAGE_SIZE at a time
for the first PUBLIC_MAX_PAGES pages only, so the whole directory can't be read off it. Each
visitor has a limit (PUBLIC_REQUESTS_PER_IP). Only what tells carriers apart is returned: never
phones, emails or officers.

Read-only, from FMCSA's Company Census File on data.transportation.gov.
"""

from collections.abc import Iterator
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import BaseModel

from app.api.bot_protection import client_ip
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.core.rate_limit import limiter
from app.ingestion.socrata_client import SocrataClient
from app.services.carrier_directory import STATES, CarrierDirectory

PUBLIC_MAX_PAGES = 3
PUBLIC_REQUESTS_PER_IP = (120, 3600.0)


def limit_public_map(request: Request) -> None:
    if get_settings().rate_limit_enabled:
        limit, window = PUBLIC_REQUESTS_PER_IP
        limiter.hit(f"public-map-ip:{client_ip(request)}", limit, window)


public_router = APIRouter(
    prefix="/public/directory", tags=["directory"], dependencies=[Depends(limit_public_map)]
)


class StateCountOut(BaseModel):
    state: str
    name: str
    carriers: int
    new_last_30_days: int


class PublicCarrierOut(BaseModel):
    usdot_number: int
    legal_name: str
    city: str | None
    power_units: int | None
    registered_on: date | None
    fleet_needs_check: bool


class RecentCarrierOut(BaseModel):
    usdot_number: int
    legal_name: str
    city: str | None
    state: str
    registered_on: date | None


class PublicStateOut(BaseModel):
    state: str
    name: str
    status: str
    sort: str
    letter: str | None
    page: int
    carriers: list[PublicCarrierOut]
    has_more: bool


def get_carrier_directory() -> Iterator[CarrierDirectory]:
    client = SocrataClient()
    try:
        yield CarrierDirectory(client)
    finally:
        client.close()


Directory = Annotated[CarrierDirectory, Depends(get_carrier_directory)]


@public_router.get("/states", response_model=list[StateCountOut])
def public_state_counts(
    directory: Directory, status: Literal["active", "inactive"] = "active"
) -> list:
    return directory.state_counts(status)


@public_router.get("/recent", response_model=list[RecentCarrierOut])
def public_recent(directory: Directory) -> list:
    """The newest active interstate registrations nationwide (the "just registered" strip)."""
    return directory.recent_registrations()


@public_router.get("/states/{state}", response_model=PublicStateOut)
def public_state_carriers(
    directory: Directory,
    state: Annotated[str, Path(min_length=2, max_length=2)],
    sort: Literal["newest", "largest", "az"] = "newest",
    letter: Annotated[str | None, Query(pattern=r"^[A-Za-z]$")] = None,
    page: Annotated[int, Query(ge=0, lt=PUBLIC_MAX_PAGES)] = 0,
    status: Literal["active", "inactive"] = "active",
):
    if state.upper() not in STATES:
        raise NotFoundError(f"No state {state.upper()}")
    result = directory.state_carriers(state, sort, letter if sort == "az" else None, page, status)
    return PublicStateOut(
        state=result.state,
        name=result.name,
        status=status,
        sort=result.sort,
        letter=result.letter,
        page=result.page,
        carriers=[
            PublicCarrierOut.model_validate(c, from_attributes=True) for c in result.carriers
        ],
        has_more=result.has_more and page + 1 < PUBLIC_MAX_PAGES,
    )
