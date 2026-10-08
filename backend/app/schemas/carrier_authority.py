"""Authority & insurance detail for one carrier (spec Section 6 "Authority & Insurance")."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DocketDetailOut(BaseModel):
    prefix: str
    number: str
    authority_type: str | None
    status: str | None
    # MOTUS (current) | LEGACY_LI (frozen 2026-05-14) | CENSUS (docket status only, not authority)
    status_source: str | None
    status_as_of: date | None
    bipd_required: Decimal | None
    bipd_on_file: Decimal | None
    cargo_required: bool | None
    cargo_on_file: bool | None
    bond_required: bool | None
    bond_on_file: bool | None
    revocation_pending: bool | None


class InsuranceFilingOut(BaseModel):
    docket: str | None
    insurance_type: str | None  # BIPD | CARGO | BOND | TRUST_FUND
    insurance_class: str | None
    insurer: str | None
    policy_number: str | None
    coverage_amount: Decimal | None
    underlying_limit: Decimal | None
    effective_date: date | None
    termination_date: date | None
    status: str | None
    source_system: str | None
    status_as_of: date | None


class AuthorityActionOut(BaseModel):
    docket: str
    action_date: date | None
    action: str
    status: str | None
    authority_type: str | None
    source_system: str


class CarrierAuthorityOut(BaseModel):
    usdot_number: int
    dockets: list[DocketDetailOut]
    current_insurance: list[InsuranceFilingOut]  # on file now
    insurance_history: list[InsuranceFilingOut]  # newest first
    authority_history: list[AuthorityActionOut]  # newest first, each action once
