"""Network & Identity for one carrier: who it is linked to, how its FMCSA registration looks,
and the ownership events the team has recorded (spec Sections 7, 29; Phase 11)."""

from collections import defaultdict
from collections.abc import Callable
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import CarrierNotFoundError, NotFoundError, ValidationError
from app.ingestion.contact_match import classify
from app.models import Address, Carrier, IdentityEvent, RawRecord
from app.repositories.authority_repository import AuthorityRepository
from app.repositories.carrier_repository import CarrierRepository
from app.repositories.identity_event_repository import IdentityEventRepository
from app.repositories.insurance_repository import InsuranceRepository
from app.repositories.observed_value_repository import ObservedValueRepository
from app.repositories.raw_record_repository import RawRecordRepository
from app.repositories.relationship_repository import RelationshipRepository
from app.repositories.signal_repository import SignalRepository
from app.schemas.network import (
    CheckOut,
    IdentityEventIn,
    IdentityEventOut,
    LinkedCarrierOut,
    NetworkOut,
    OwnershipStateOut,
    SharedDetailOut,
)
from app.services.boc3_service import process_agents
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.contact_link_service import (
    CONTACT_LINK_TYPES,
    LINK_TYPE,
    ContactLinkService,
    contact_keys,
)
from app.services.identity_events import (
    ATTESTATION_CORRECTED,
    OWNERSHIP_CHANGE_ATTESTED,
    ownership_state,
)
from app.services.registration_health import AddressPeer, address_peer, registration_checks
from app.services.registration_orders_service import RegistrationOrdersService
from app.services.signal_service import SignalService
from app.services.timeline_service import TimelineService
from app.services.vehicle_observation_service import USDOT

KIND = {link_type: kind for kind, link_type in LINK_TYPE.items()}


class IdentityEventNotFoundError(NotFoundError):
    code = "identity_event_not_found"


class NetworkService:
    def __init__(
        self,
        db: Session,
        refresh: CarrierRefreshService,
        contact_links: ContactLinkService,
        orders: RegistrationOrdersService,
        timeline: Callable[[], TimelineService],
        signals: Callable[[], SignalService],
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        self.db = db
        self.refresh = refresh
        self.contact_links = contact_links
        self.orders = orders
        self.timeline = timeline
        self.signals = signals
        self.today = today
        self.observed = ObservedValueRepository(db)
        self.relationships = RelationshipRepository(db)
        self.events = IdentityEventRepository(db)
        self.raw_records = RawRecordRepository(db)

    def get(self, usdot_number: int) -> NetworkOut:
        carrier = self.refresh.ensure_fresh(usdot_number).carrier
        if carrier is None:
            raise CarrierNotFoundError(f"No carrier with USDOT {usdot_number}")
        census = self.raw_records.latest(
            "dot_socrata", get_settings().census_dataset_id, str(usdot_number)
        )
        oos, revocations = self.orders.latest(usdot_number)
        checks = registration_checks(
            carrier,
            census.payload if census else {},
            AuthorityRepository(self.db).for_carrier(carrier.id),
            self.observed.current(Address, carrier.id),
            oos,
            revocations,
            get_settings().legacy_li_frozen_on,
            self.today(),
            InsuranceRepository(self.db).for_carrier(carrier.id),
            self._address_peers(carrier),
            process_agents(self.raw_records, usdot_number),
        )
        events = self.events.for_carrier(carrier.id)
        state = ownership_state(events)
        return NetworkOut(
            usdot_number=usdot_number,
            linked_carriers=self._linked(carrier),
            links_checked_at=self.contact_links.last_refreshed_at(usdot_number),
            registration_checks=[CheckOut(**vars(c)) for c in checks],
            ownership=OwnershipStateOut(
                state=state.state, summary=state.summary, action=state.action
            ),
            identity_events=self._events_out(events),
        )

    def add_event(self, usdot_number: int, values: IdentityEventIn) -> IdentityEventOut:
        """Record an event, then rebuild the carrier's timeline and signals from stored data."""
        carrier = self._loaded(usdot_number)
        if values.event_date > self.today():
            raise ValidationError("The event date cannot be in the future")
        if values.event_type == ATTESTATION_CORRECTED:
            target = self.events.get(values.corrects_event_id) if values.corrects_event_id else None
            if (
                target is None
                or target.carrier_id != carrier.id
                or target.event_type != OWNERSHIP_CHANGE_ATTESTED
            ):
                raise ValidationError(
                    "A correction must point at an ownership attestation recorded for this carrier"
                )
            if values.event_date < target.event_date:
                raise ValidationError("A correction cannot be dated before the attestation")
        elif values.corrects_event_id is not None:
            raise ValidationError("Only an attestation correction can point at another event")
        event = self.events.add(
            IdentityEvent(
                carrier_id=carrier.id,
                event_type=values.event_type,
                event_date=values.event_date,
                platform=values.platform,
                description=values.description,
                supporting_document=values.supporting_document,
                corrects_event_id=values.corrects_event_id,
                entered_by=values.entered_by,
                source="manual",
            )
        )
        self.db.commit()
        self.timeline().rebuild(carrier)
        self.signals().rebuild(carrier)
        return next(
            e for e in self._events_out(self.events.for_carrier(carrier.id)) if e.id == event.id
        )

    def _loaded(self, usdot_number: int) -> Carrier:
        carrier = CarrierRepository(self.db).get_by_usdot(usdot_number)
        if carrier is None:
            raise CarrierNotFoundError(
                f"USDOT {usdot_number} is not loaded yet; open the carrier first"
            )
        return carrier

    def _events_out(self, events: list[IdentityEvent]) -> list[IdentityEventOut]:
        corrected_by: dict[int, list[int]] = defaultdict(list)
        for e in events:
            if e.corrects_event_id:
                corrected_by[e.corrects_event_id].append(e.id)
        return [
            IdentityEventOut(
                id=e.id,
                event_type=e.event_type,
                event_date=e.event_date,
                platform=e.platform,
                description=e.description,
                supporting_document=e.supporting_document,
                corrects_event_id=e.corrects_event_id,
                corrected_by=corrected_by.get(e.id, []),
                source=e.source,
                entered_by=e.entered_by,
                created_at=e.created_at,
            )
            for e in events
        ]

    def _address_peers(self, carrier: Carrier) -> list[AddressPeer]:
        links = self.relationships.from_source(
            (USDOT, carrier.usdot_number), [LINK_TYPE["address"]]
        )
        raw_ids = {link.raw_record_id for link in links if link.raw_record_id}
        raws = {r.id: r for r in self.db.query(RawRecord).filter(RawRecord.id.in_(raw_ids))}
        return [
            address_peer(link.target_entity_id, raws[link.raw_record_id].payload)
            for link in links
            if link.raw_record_id in raws
        ]

    def _linked(self, carrier: Carrier) -> list[LinkedCarrierOut]:
        links = self.relationships.from_source((USDOT, carrier.usdot_number), CONTACT_LINK_TYPES)
        if not links:
            return []
        raws = {
            r.id: r
            for r in self.db.query(RawRecord).filter(
                RawRecord.id.in_({link.raw_record_id for link in links if link.raw_record_id})
            )
        }
        keys = contact_keys(carrier, self.observed)
        signal_ids = {s.signal_key: s.id for s in SignalRepository(self.db).for_carrier(carrier.id)}
        grouped = defaultdict(list)
        for link in links:
            grouped[link.target_entity_id].append(link)

        out = []
        for other, other_links in grouped.items():
            raw = raws.get(other_links[0].raw_record_id or -1)
            payload = raw.payload if raw else {}
            values = classify(payload, keys).values
            other_links.sort(key=lambda link: CONTACT_LINK_TYPES.index(link.relationship_type))
            status = payload.get("status_code")
            added = str(payload.get("add_date") or "")
            out.append(
                LinkedCarrierOut(
                    usdot_number=other,
                    legal_name=payload.get("legal_name"),
                    status="ACTIVE" if status == "A" else ("INACTIVE" if status else None),
                    registered=(
                        date(int(added[:4]), int(added[4:6]), int(added[6:8]))
                        if len(added) >= 8 and added[:8].isdigit()
                        else None
                    ),
                    city=payload.get("phy_city"),
                    state=payload.get("phy_state"),
                    shares=[
                        SharedDetailOut(
                            kind=KIND[link.relationship_type],
                            value=values.get(KIND[link.relationship_type]),
                            confidence=link.confidence.value,
                            first_seen=link.first_seen,
                            last_seen=link.last_seen,
                        )
                        for link in other_links
                    ],
                    signal_id=signal_ids.get(f"shared_contact:{other}"),
                )
            )
        # Strongest link first, then the number of shared details.
        out.sort(
            key=lambda c: (
                min(CONTACT_LINK_TYPES.index(LINK_TYPE[s.kind]) for s in c.shares),
                -len(c.shares),
                c.usdot_number,
            )
        )
        return out
