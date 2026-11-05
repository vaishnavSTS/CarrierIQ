"""The carrier map: active interstate carriers by state (services/carrier_directory.py).

For anyone logged in to a portal (carrier, broker, insurance agent or staff). Read-only, from
FMCSA's Company Census File on data.transportation.gov.
"""

from collections.abc import Iterator
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel

from app.api.auth import get_current_user
from app.core.exceptions import NotFoundError
from app.ingestion.socrata_client import SocrataClient
from app.services.carrier_directory import STATES, CarrierDirectory

router = APIRouter(
    prefix="/directory", tags=["directory"], dependencies=[Depends(get_current_user)]
)


class StateCountOut(BaseModel):
    state: str
    name: str
    carriers: int
    new_last_30_days: int


class DirectoryCarrierOut(BaseModel):
    usdot_number: int
    legal_name: str
    dba_name: str | None
    city: str | None
    county_code: str | None
    power_units: int | None
    drivers: int | None
    registered_on: date | None
    fleet_needs_check: bool


class StatePageOut(BaseModel):
    state: str
    name: str
    sort: str
    letter: str | None
    page: int
    carriers: list[DirectoryCarrierOut]
    has_more: bool


def get_carrier_directory() -> Iterator[CarrierDirectory]:
    client = SocrataClient()
    try:
        yield CarrierDirectory(client)
    finally:
        client.close()


Directory = Annotated[CarrierDirectory, Depends(get_carrier_directory)]


@router.get("/states", response_model=list[StateCountOut])
def state_counts(directory: Directory) -> list:
    return directory.state_counts()


@router.get("/states/{state}", response_model=StatePageOut)
def state_carriers(
    directory: Directory,
    state: Annotated[str, Path(min_length=2, max_length=2)],
    sort: Literal["newest", "largest", "az"] = "newest",
    letter: Annotated[str | None, Query(pattern=r"^[A-Za-z]$")] = None,
    page: Annotated[int, Query(ge=0, le=200)] = 0,
):
    if state.upper() not in STATES:
        raise NotFoundError(f"No state {state.upper()}")
    return directory.state_carriers(state, sort, letter, page)
