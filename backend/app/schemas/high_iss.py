"""STS's High ISS list (carriers at or above an Estimated ISS threshold)."""

from datetime import date

from pydantic import BaseModel


class HighIssCarrierOut(BaseModel):
    usdot_number: int
    legal_name: str | None
    dba_name: str | None
    phone: str | None  # e.g. (209) 555-0123
    location: str | None  # physical address: city, state
    fleet_size: int | None
    iss: int  # Estimated ISS, 1-100
    band: str | None  # PASS | OPTIONAL | INSPECT
    score_since: date  # FMCSA month this score was first calculated for


class HighIssOut(BaseModel):
    min_score: int
    data_month: date | None  # the FMCSA month of the newest ISS tables
    carriers: list[HighIssCarrierOut]  # worst first
