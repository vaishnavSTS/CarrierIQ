"""Authority & insurance detail for one carrier, refreshed on demand first."""

import re

from app.core.exceptions import CarrierNotFoundError
from app.models import Insurance
from app.repositories.authority_history_repository import AuthorityHistoryRepository
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.schemas.carrier_authority import (
    AuthorityActionOut,
    CarrierAuthorityOut,
    DocketDetailOut,
    InsuranceFilingOut,
)
from app.services.carrier_refresh_service import CarrierRefreshService

_EMAIL = re.compile(r"\S+@\S+")


class CarrierAuthorityService:
    def __init__(
        self,
        refresh: CarrierRefreshService,
        authorities: AuthorityRepository,
        insurance: InsuranceRepository,
        history: AuthorityHistoryRepository,
    ) -> None:
        self.refresh = refresh
        self.authorities = authorities
        self.insurance = insurance
        self.history = history

    def get(self, usdot_number: int) -> CarrierAuthorityOut:
        carrier = self.refresh.ensure_fresh(usdot_number).carrier
        if carrier is None:
            raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number}")

        filings = self.insurance.for_carrier(carrier.id)  # newest effective date first
        actions: dict[tuple[str, object, str], AuthorityActionOut] = {}
        for row in self.history.for_carrier(carrier.id):  # newest first
            docket = f"{row.docket_prefix.value}{row.docket_number}"
            action = _EMAIL.sub("(filing agent)", row.action)
            key = (docket, row.action_date, action)
            # The same action reported by both systems is listed once (Motus preferred).
            if key not in actions or row.source_system == "MOTUS":
                actions[key] = AuthorityActionOut(
                    docket=docket,
                    action_date=row.action_date,
                    action=action,
                    status=row.status,
                    authority_type=row.authority_type,
                    source_system=row.source_system,
                )
        return CarrierAuthorityOut(
            usdot_number=carrier.usdot_number,
            dockets=[
                DocketDetailOut(
                    prefix=a.docket_prefix.value,
                    number=a.docket_number,
                    authority_type=a.authority_type,
                    status=a.status,
                    status_source=a.status_source,
                    status_as_of=a.status_as_of,
                    bipd_required=a.bipd_required,
                    bipd_on_file=a.bipd_on_file,
                    cargo_required=a.cargo_required,
                    cargo_on_file=a.cargo_on_file,
                    bond_required=a.bond_required,
                    bond_on_file=a.bond_on_file,
                    revocation_pending=a.revocation_pending,
                )
                for a in self.authorities.for_carrier(carrier.id)
            ],
            current_insurance=[_filing(f) for f in filings if f.on_file],
            insurance_history=[
                _filing(f)
                for f in sorted(
                    (f for f in filings if not f.on_file),
                    key=lambda f: f.termination_date or f.effective_date or f.updated_at.date(),
                    reverse=True,
                )
            ],
            authority_history=list(actions.values()),
        )


def _filing(f: Insurance) -> InsuranceFilingOut:
    return InsuranceFilingOut(
        docket=f"{f.docket_prefix.value}{f.docket_number}" if f.docket_prefix else None,
        insurance_type=f.insurance_type,
        insurance_class=f.insurance_class,
        insurer=f.insurer,
        policy_number=f.policy_number,
        coverage_amount=f.coverage_amount,
        underlying_limit=f.underlying_limit,
        effective_date=f.effective_date,
        termination_date=f.termination_date,
        status=f.status,
        source_system=f.source_system,
        status_as_of=f.status_as_of,
    )
