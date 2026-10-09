"""Authority & insurance detail for one carrier, refreshed on demand first."""

import re
from collections.abc import Callable
from datetime import UTC, date, datetime

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
    ProcessAgentOut,
    RenewalOut,
)
from app.services.boc3_service import ProcessAgent
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.insurance_renewal import describe, renewals

_EMAIL = re.compile(r"\S+@\S+")


class CarrierAuthorityService:
    def __init__(
        self,
        refresh: CarrierRefreshService,
        authorities: AuthorityRepository,
        insurance: InsuranceRepository,
        history: AuthorityHistoryRepository,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
        process_agents: Callable[[int], list[ProcessAgent] | None] = lambda _: None,
    ) -> None:
        self.process_agents = process_agents
        self.refresh = refresh
        self.authorities = authorities
        self.insurance = insurance
        self.history = history
        self.today = today

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
            process_agents=(
                None
                if (agents := self.process_agents(carrier.usdot_number)) is None
                else [ProcessAgentOut(**vars(a)) for a in agents]
            ),
            renewals=[
                RenewalOut(
                    docket=r.docket,
                    insurance_type=r.insurance_type,
                    current_effective=r.current_effective,
                    since=r.since,
                    filings=r.filings,
                    expected=r.expected,
                    data_as_of=r.data_as_of,
                    state=r.state,
                    summary=describe(r),
                )
                for r in renewals(filings, self.today())
            ],
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
