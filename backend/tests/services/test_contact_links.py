"""Contact links between carriers and the shared contact rule (requires TEST_DATABASE_URL).

USDOT 295017's real census row: phone 13604794800, fax 3603732751, 1770 NE FUSON RD 98311,
officers SHAUNA WASHBURN and CRAIG LOIDHAMER.
"""

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.intelligence.base_rule import RuleContext
from app.intelligence.rules.shared_contact import SharedContactRule
from app.models import Relationship
from app.models.enums import Confidence, Severity
from app.repositories.carrier_repository import CarrierRepository
from app.services.census_ingestion_service import build_census_ingestion_service
from app.services.contact_link_service import build_contact_link_service
from tests.ingestion.helpers import FakeDotApi, load_census_rows


def other(dot: int, name: str, status: str = "A", **fields: Any) -> dict[str, Any]:
    return {
        "dot_number": str(dot),
        "legal_name": name,
        "status_code": status,
        "add_date": "20200101",
        **fields,
    }


OTHERS = [
    # Same phone (without the country code) and an officer; no longer active.
    other(
        900001, "UNITED MOVERS LLC", "I", phone="3604794800", company_officer_1="CRAIG LOIDHAMER"
    ),
    # Same building, another suite: shown on the Network tab, not a signal.
    other(900002, "FUSON STORAGE", phy_street="1770 NE FUSON RD STE 2", phy_zip="98311"),
    # Same officer name only.
    other(900003, "WASHBURN HAULING", company_officer_2="SHAUNA WASHBURN"),
    # The fax number is on many carriers: a service provider's.
    *[other(900010 + i, f"CLIENT {i} INC", fax="3603732751") for i in range(5)],
]


def setup(db: Session, rows: list[dict[str, Any]]) -> FakeDotApi:
    api = FakeDotApi(load_census_rows() + rows)
    build_census_ingestion_service(db, api.client()).ingest(295017)
    return api


def links(db: Session) -> dict[tuple[str, int], Relationship]:
    rows = db.scalars(select(Relationship).where(Relationship.source_entity_id == 295017))
    return {(r.relationship_type, r.target_entity_id): r for r in rows}


def test_links_record_what_is_shared(db: Session) -> None:
    api = setup(db, OTHERS)

    result = build_contact_link_service(db, api.client()).ingest(295017)

    assert result.linked_carriers == 8
    found = links(db)
    assert ("SHARES_PHONE", 900001) in found and ("SHARES_OFFICER", 900001) in found
    assert ("SHARES_BUILDING", 900002) in found and ("SHARES_ADDRESS", 900002) not in found
    assert found[("SHARES_BUILDING", 900002)].confidence == Confidence.LOW
    assert ("SHARES_OFFICER", 900003) in found
    assert found[("SHARES_PHONE", 900001)].raw_record_id is not None


def test_rerun_keeps_first_seen_and_drops_details_no_longer_shared(db: Session) -> None:
    api = setup(db, OTHERS)
    service = build_contact_link_service(db, api.client())
    service.ingest(295017)
    links(db)[("SHARES_PHONE", 900001)].first_seen = date(2026, 1, 1)
    db.flush()

    api.census = [r for r in api.census if r["dot_number"] != "900003"]  # officer link gone
    service.ingest(295017)

    again = links(db)
    assert again[("SHARES_PHONE", 900001)].first_seen == date(2026, 1, 1)
    assert again[("SHARES_PHONE", 900001)].observation_count == 2
    assert ("SHARES_OFFICER", 900003) not in again


def test_shared_contact_signals(db: Session) -> None:
    api = setup(db, OTHERS)
    build_contact_link_service(db, api.client()).ingest(295017)
    carrier = CarrierRepository(db).get_by_usdot(295017)
    assert carrier is not None

    found = {
        s.signal_key: s
        for s in SharedContactRule().evaluate(RuleContext(db, carrier, date(2026, 10, 9)))
    }

    assert "shared_contact:900002" not in found  # building only
    movers = found["shared_contact:900001"]
    assert movers.title == "Shares phone and officer with USDOT 900001 (UNITED MOVERS LLC)"
    assert (movers.severity, movers.confidence) == (Severity.HIGH, Confidence.HIGH)  # 2 + inactive
    assert "not a finding" in movers.description
    assert [e.field_name for e in movers.evidence] == ["phone", "officer"]
    washburn = found["shared_contact:900003"]
    assert (washburn.severity, washburn.confidence) == (Severity.LOW, Confidence.MEDIUM)
    client = found["shared_contact:900010"]
    assert (client.severity, client.confidence) == (Severity.LOW, Confidence.LOW)
    assert "dispatch, compliance or filing service" in client.description
    assert "(shared by 5 carriers)" in (client.evidence[0].observed_value or "")


def test_evidence_names_the_number_actually_shared(db: Session) -> None:
    # Only the fax matches; the other carrier's office phone is different.
    twin = other(900020, "FAX TWIN LLC", phone="2065550000", fax="3603732751")
    api = setup(db, [twin])
    build_contact_link_service(db, api.client()).ingest(295017)
    carrier = CarrierRepository(db).get_by_usdot(295017)
    assert carrier is not None

    (signal,) = SharedContactRule().evaluate(RuleContext(db, carrier, date(2026, 10, 9)))

    assert signal.evidence[0].observed_value == "Same phone (360) 373-2751 on USDOT 900020"
