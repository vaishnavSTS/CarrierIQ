"""Dashboard overview: totals across all loaded carriers and the newest signals."""

from datetime import datetime

from pydantic import BaseModel


class TotalsOut(BaseModel):
    carriers: int
    inspections: int
    vehicles: int  # distinct VINs
    open_signals: int  # active, OPEN, above INFO
    open_by_severity: dict[str, int]  # HIGH / MEDIUM / LOW


class RecentSignalOut(BaseModel):
    id: int
    usdot_number: int
    legal_name: str
    signal_type: str
    severity: str
    title: str
    detected_at: datetime | None


class DashboardOut(BaseModel):
    totals: TotalsOut
    recent_signals: list[RecentSignalOut]  # newest first
