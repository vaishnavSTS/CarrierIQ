"""What other systems get from the partner API."""

from pydantic import BaseModel


class PartnerIssOut(BaseModel):
    usdot_number: int
    month: str  # the FMCSA data month the score comes from, "YYYY-MM"
    # Carrier Safety Scan's estimate of FMCSA's ISS, 1-100 (lower is better), not FMCSA's official
    # value; null when FMCSA's data isn't enough for a score
    estimated_iss: int | None
