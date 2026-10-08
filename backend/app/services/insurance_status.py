"""A carrier's headline insurance status for the profile header and search results."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.ingestion.operating_authority_normalizer import LEGACY, MOTUS
from app.models import Authority, Insurance

ON_FILE = "ON_FILE"
NOT_ON_FILE = "NOT_ON_FILE"


@dataclass(frozen=True)
class InsuranceStatus:
    status: str | None  # ON_FILE | NOT_ON_FILE | None (no active authority to insure)
    source_system: str | None  # where the filings came from (MOTUS | LEGACY_LI)
    as_of: date | None  # oldest "as of" among the filings relied on


def insurance_status(dockets: Sequence[Authority], filings: Sequence[Insurance]) -> InsuranceStatus:
    """ON_FILE when every docket with active authority has a BI&PD filing on file; NOT_ON_FILE
    when one of them has none. Brokers' property-broker dockets need a bond or trust fund
    rather than BI&PD, so either counts for them. Only an operating-authority status (Motus or
    legacy L&I) counts as active: a census docket status is not one."""
    active = [d for d in dockets if is_active_authority(d)]
    if not active:
        return InsuranceStatus(None, None, None)
    relied_on: list[Insurance] = []
    for docket in active:
        on_file = [
            f
            for f in filings
            if f.on_file
            and (f.docket_prefix, f.docket_number) == (docket.docket_prefix, docket.docket_number)
            and f.insurance_type in _accepted(docket)
        ]
        if not on_file:
            return InsuranceStatus(NOT_ON_FILE, None, None)
        relied_on += on_file
    systems = {f.source_system for f in relied_on if f.source_system}
    dates = [f.status_as_of for f in relied_on if f.status_as_of]
    return InsuranceStatus(
        ON_FILE,
        systems.pop() if len(systems) == 1 else ("MIXED" if systems else None),
        min(dates) if dates else None,
    )


def is_active_authority(docket: Authority) -> bool:
    return docket.status == "ACTIVE" and docket.status_source in (MOTUS, LEGACY)


def _accepted(docket: Authority) -> set[str]:
    if docket.authority_type and "BROKER" in docket.authority_type.upper():
        return {"BIPD", "BOND", "TRUST_FUND"}
    return {"BIPD"}
