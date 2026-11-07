"""Admin Monitored DOTs (routes/monitored.py)."""

from datetime import datetime

from pydantic import BaseModel, Field


class MonitoredCarrierIn(BaseModel):
    usdot_number: int = Field(gt=0, lt=100_000_000)


class MonitoredCarrierOut(BaseModel):
    usdot_number: int
    legal_name: str | None  # None: not loaded in Carrier Safety Scan any more
    dba_name: str | None
    added_at: datetime
    added_by: str | None  # the admin's name; None once that account is deleted
