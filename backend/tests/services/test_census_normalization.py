"""Census records applied to the canonical tables (requires TEST_DATABASE_URL)."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Address, Authority, Carrier, Domain, Officer, Phone
from app.models.enums import AddressType, DocketPrefix, PhoneType
from app.services.census_ingestion_service import (
    CensusIngestResult,
    build_census_ingestion_service,
)
from tests.ingestion.helpers import load_census_rows, responding_with


def ingest(db: Session, **overrides: Any) -> CensusIngestResult:
    row = {**load_census_rows()[0], **overrides}
    row = {k: v for k, v in row.items() if v is not None}
    return build_census_ingestion_service(db, responding_with([row])).ingest(295017)


def all_rows(db: Session, model: Any) -> list[Any]:
    return list(db.scalars(select(model).order_by(model.id)))


def test_first_ingest_creates_carrier_and_children_traced_to_the_raw_record(
    db: Session,
) -> None:
    result = ingest(db)

    carrier = db.scalars(select(Carrier)).one()
    assert result.carrier is not None
    assert result.carrier.id == carrier.id
    assert carrier.usdot_number == 295017
    assert carrier.legal_name == "UNITED MOVING AND STORAGE INC"
    assert carrier.registration_status == "ACTIVE"
    assert carrier.fleet_size == 18
    assert carrier.last_refreshed_at is not None

    assert result.raw_record is not None
    raw_id = result.raw_record.id
    children = [
        *all_rows(db, Address),
        *all_rows(db, Phone),
        *all_rows(db, Officer),
        *all_rows(db, Domain),
        *all_rows(db, Authority),
    ]
    assert len(children) == 2 + 2 + 2 + 1 + 1
    for row in children:
        assert row.carrier_id == carrier.id
        assert row.raw_record_id == raw_id
        assert row.source == "dot_socrata"

    authority = db.scalars(select(Authority)).one()
    assert (authority.docket_prefix, authority.docket_number) == (DocketPrefix.MC, "139446")


def test_reingesting_the_same_record_creates_no_duplicates(db: Session) -> None:
    ingest(db)
    ingest(db)

    assert len(all_rows(db, Carrier)) == 1
    assert len(all_rows(db, Address)) == 2
    assert len(all_rows(db, Phone)) == 2
    assert len(all_rows(db, Officer)) == 2
    assert len(all_rows(db, Domain)) == 1
    assert len(all_rows(db, Authority)) == 1


def test_moved_address_keeps_the_old_one_as_not_current(db: Session) -> None:
    ingest(db)

    result = ingest(db, phy_street="456 NEW STREET")

    physical = [a for a in all_rows(db, Address) if a.address_type == AddressType.PHYSICAL]
    assert [(a.street, a.is_current) for a in physical] == [
        ("1770 NE FUSON RD", False),
        ("456 NEW STREET", True),
    ]
    assert result.raw_record is not None
    assert physical[1].raw_record_id == result.raw_record.id  # traced to the newer record


def test_removed_phone_is_marked_not_current(db: Session) -> None:
    ingest(db)

    ingest(db, fax=None)

    fax = next(p for p in all_rows(db, Phone) if p.phone_type == PhoneType.FAX)
    assert fax.is_current is False
    office = next(p for p in all_rows(db, Phone) if p.phone_type == PhoneType.OFFICE)
    assert office.is_current is True


def test_authority_status_change_updates_the_docket(db: Session) -> None:
    ingest(db)

    ingest(db, docket1_status_code="I")

    authority = db.scalars(select(Authority)).one()
    assert authority.status == "INACTIVE"


def test_carrier_current_values_follow_the_latest_record(db: Session) -> None:
    ingest(db)

    ingest(db, legal_name="UNITED MOVING & STORAGE LLC", power_units="25")

    carrier = db.scalars(select(Carrier)).one()
    assert carrier.legal_name == "UNITED MOVING & STORAGE LLC"
    assert carrier.fleet_size == 25
