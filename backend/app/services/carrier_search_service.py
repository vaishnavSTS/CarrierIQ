"""Carrier search by USDOT, docket (MC/MX/FF) or name (spec Sections 5.1, 19.2, 21).

- USDOT: the carrier is loaded or refreshed on demand, then served from the database.
- Docket: the live census is asked which USDOT numbers hold the docket (several can); each is
  loaded on demand. Carriers already stored under the docket are included too.
- Name: loaded carriers that match come first, then live census matches. Live-only matches are
  not saved (`loaded = False`); opening one loads it by USDOT.
"""

import logging
from collections.abc import Sequence

from app.core.exceptions import SourceDataError
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.company_census_normalizer import normalize_census_row
from app.models import Address, Authority, Carrier
from app.models.enums import AddressType
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.schemas.carrier_search import CarrierSearchResponse, CarrierSearchResult, DocketOut
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.carrier_search_query import SearchKind, SearchQuery, parse_search_query
from app.services.insurance_status import insurance_status

logger = logging.getLogger(__name__)


class CarrierSearchService:
    def __init__(
        self,
        census: CompanyCensusAdapter,
        refresh: CarrierRefreshService,
        carriers: CarrierRepository,
        authorities: AuthorityRepository,
        observed: ObservedValueRepository,
        insurance: InsuranceRepository,
        *,
        name_limit: int,
        docket_limit: int,
    ) -> None:
        self.census = census
        self.refresh = refresh
        self.carriers = carriers
        self.authorities = authorities
        self.observed = observed
        self.insurance = insurance
        self.name_limit = name_limit
        self.docket_limit = docket_limit

    def search(self, text: str) -> CarrierSearchResponse:
        query = parse_search_query(text)
        if query.kind is SearchKind.USDOT:
            results = self._by_usdot(query)
        elif query.kind is SearchKind.DOCKET:
            results = self._by_docket(query)
        else:
            results = self._by_name(query)
        logger.info("Search %r (%s): %d result(s)", text, query.kind.value, len(results))
        return CarrierSearchResponse(query=text, query_type=query.kind, results=results)

    def _by_usdot(self, query: SearchQuery) -> list[CarrierSearchResult]:
        assert query.usdot_number is not None
        outcome = self.refresh.ensure_fresh(query.usdot_number)
        if outcome.carrier is None:
            return []
        stale = {outcome.carrier.id} if outcome.stale else set()
        return self._loaded_results([outcome.carrier], stale)

    def _by_docket(self, query: SearchQuery) -> list[CarrierSearchResult]:
        assert query.docket_prefix is not None and query.docket_number is not None
        usdots = self.census.find_usdots_by_docket(
            query.docket_prefix, query.docket_number, self.docket_limit
        )
        carriers: dict[int, Carrier] = {}
        stale: set[int] = set()
        for usdot in usdots:
            outcome = self.refresh.ensure_fresh(usdot)
            if outcome.carrier is not None:
                carriers[outcome.carrier.id] = outcome.carrier
                if outcome.stale:
                    stale.add(outcome.carrier.id)
        # Carriers stored under this docket that the source no longer lists.
        for carrier in self.carriers.find_by_docket(query.docket_prefix, query.docket_number):
            carriers.setdefault(carrier.id, carrier)
        ordered = sorted(carriers.values(), key=lambda c: c.usdot_number)
        return self._loaded_results(ordered, stale)

    def _by_name(self, query: SearchQuery) -> list[CarrierSearchResult]:
        assert query.name is not None
        loaded = self._loaded_results(self.carriers.search_by_name(query.name, self.name_limit))
        seen = {result.usdot_number for result in loaded}

        results = list(loaded)
        for row in self.census.search_by_name(query.name, self.name_limit):
            if len(results) >= self.name_limit:
                break
            result = _live_result(row)
            if result is not None and result.usdot_number not in seen:
                results.append(result)
                seen.add(result.usdot_number)
        return results

    def _loaded_results(
        self, carriers: Sequence[Carrier], stale: set[int] | None = None
    ) -> list[CarrierSearchResult]:
        ids = [carrier.id for carrier in carriers]
        dockets = self.authorities.for_carriers(ids)
        addresses = self.observed.current_for_carriers(Address, ids)
        filings = self.insurance.for_carriers(ids)
        results = []
        for carrier in carriers:
            physical = next(
                (a for a in addresses[carrier.id] if a.address_type == AddressType.PHYSICAL), None
            )
            results.append(
                CarrierSearchResult(
                    usdot_number=carrier.usdot_number,
                    legal_name=carrier.legal_name,
                    dba_name=carrier.dba_name,
                    dockets=[_docket(a) for a in dockets[carrier.id]],
                    authority_status=authority_status([a.status for a in dockets[carrier.id]]),
                    registration_status=carrier.registration_status,
                    insurance_status=insurance_status(
                        dockets[carrier.id], filings[carrier.id]
                    ).status,
                    fleet_size=carrier.fleet_size,
                    city=physical.city if physical else None,
                    state=physical.state if physical else None,
                    last_refreshed_at=carrier.last_refreshed_at,
                    loaded=True,
                    stale=carrier.id in (stale or set()),
                )
            )
        return results


def authority_status(statuses: Sequence[str | None]) -> str | None:
    """ACTIVE if any docket is active, else the first docket's status; None without dockets."""
    if not statuses:
        return None
    return "ACTIVE" if "ACTIVE" in statuses else statuses[0]


def _docket(authority: Authority) -> DocketOut:
    return DocketOut(
        prefix=authority.docket_prefix.value,
        number=authority.docket_number,
        status=authority.status,
    )


def _live_result(row: dict[str, object]) -> CarrierSearchResult | None:
    """A search result straight from a live census row, without saving anything."""
    try:
        record = normalize_census_row(row)
    except SourceDataError:
        logger.warning("Skipping unusable census search row: %r", row.get("dot_number"))
        return None
    physical = next((a for a in record.addresses if a.address_type == AddressType.PHYSICAL), None)
    return CarrierSearchResult(
        usdot_number=record.carrier.usdot_number,
        legal_name=record.carrier.legal_name,
        dba_name=record.carrier.dba_name,
        dockets=[
            DocketOut(prefix=a.docket_prefix.value, number=a.docket_number, status=a.status)
            for a in record.authorities
        ],
        authority_status=authority_status([a.status for a in record.authorities]),
        registration_status=record.carrier.registration_status,
        fleet_size=record.carrier.fleet_size,
        city=physical.city if physical else None,
        state=physical.state if physical else None,
        last_refreshed_at=None,
        loaded=False,
    )
