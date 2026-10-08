"""Inspection adapter and normalizer, using real rows saved from the live API."""

from datetime import date

import httpx
import pytest

from app.core.exceptions import SourceDataError, SourceFetchError, ValidationError
from app.ingestion.vehicle_inspection_normalizer import (
    cfr_part_title,
    normalize_inspection,
    normalize_vin,
)
from app.ingestion.vehicle_inspections import UNIT_BATCH_SIZE, VehicleInspectionAdapter
from tests.ingestion.helpers import (
    inspection_api,
    load_inspection_rows,
    load_violation_rows,
    socrata_client,
)

# --- adapter ---


def test_fetches_headers_and_their_units() -> None:
    headers, units = load_inspection_rows()
    adapter = VehicleInspectionAdapter(inspection_api(headers, units))

    fetched = adapter.fetch_by_usdot(295017)
    fetched_units = adapter.fetch_units([h["inspection_id"] for h in fetched])

    assert [h["inspection_id"] for h in fetched] == [
        "82915718",
        "85796455",
        "86137641",
        "87518319",
    ]
    assert len(fetched_units) == 6


def test_unit_ids_are_requested_in_batches() -> None:
    wheres: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        wheres.append(request.url.params["$where"])
        return httpx.Response(200, json=[])

    ids = [str(n) for n in range(1, UNIT_BATCH_SIZE + 6)]
    VehicleInspectionAdapter(socrata_client(handler)).fetch_units(ids)

    assert len(wheres) == 2
    assert wheres[1] == f"inspection_id in ({','.join(repr(i) for i in ids[UNIT_BATCH_SIZE:])})"


def test_non_numeric_inspection_id_never_reaches_the_query() -> None:
    adapter = VehicleInspectionAdapter(socrata_client(lambda _: httpx.Response(200, json=[])))

    with pytest.raises(SourceFetchError, match="Invalid inspection_id"):
        adapter.fetch_units(["123", "1') OR ('1'='1"])


def test_inspection_for_another_carrier_is_a_source_error() -> None:
    headers, units = load_inspection_rows()
    wrong = [{**headers[0], "dot_number": "999"}]
    client = socrata_client(lambda _: httpx.Response(200, json=wrong))

    with pytest.raises(SourceFetchError, match="belongs to USDOT"):
        VehicleInspectionAdapter(client).fetch_by_usdot(295017)


def test_invalid_usdot_is_rejected() -> None:
    with pytest.raises(ValidationError):
        VehicleInspectionAdapter(socrata_client(lambda _: httpx.Response(200))).fetch_by_usdot(0)


# --- normalizer ---


def test_real_inspection_is_normalized() -> None:
    headers, units = load_inspection_rows()

    values = normalize_inspection(headers[0], units)

    assert values.inspection_id == "82915718"
    assert values.inspection_date == date(2024, 10, 14)
    assert values.inspection_level == 2
    assert values.state == "WA"
    assert values.location == "PORT ANGELES WA"
    assert values.vin == "1FUBCXBS9DHFG2386"  # unit 1 (the trailer is unit 2)
    assert values.vehicle_oos is True
    assert values.driver_oos is False
    assert values.violation_data["viol_total"] == 3
    assert values.violation_data["vehicle_oos_total"] == 1


def test_inspection_without_units_has_no_vin() -> None:
    headers, _ = load_inspection_rows()

    assert normalize_inspection(headers[0], []).vin is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1fubcxbs9dhfg2386", "1FUBCXBS9DHFG2386"),
        ("1FUB-CXBS9 DHFG2386", "1FUBCXBS9DHFG2386"),
        ("1FUBCXBS9DHFG238", None),  # 16 characters
        ("1FUBCXBS9DHFG238O", None),  # VINs never contain O
        ("UNKNOWN", None),
        (None, None),
    ],
)
def test_normalize_vin(raw: str | None, expected: str | None) -> None:
    assert normalize_vin(raw) == expected


def test_inspection_without_a_valid_date_is_rejected() -> None:
    headers, units = load_inspection_rows()

    with pytest.raises(SourceDataError, match="insp_date"):
        normalize_inspection({**headers[0], "insp_date": "00000000"}, units)


def test_violations_are_attached_in_sequence_with_their_regulation() -> None:
    headers, units = load_inspection_rows()
    violations = list(reversed(load_violation_rows()))  # order must not depend on the source

    values = normalize_inspection(headers[0], units, violations)

    first, second, third = values.violation_data["violations"]
    assert first == {
        "code": "393.95A4-EEUS",
        "description": "Emergency Equipment - Fire Extinguishers - unsecured",
        "part": 393,
        "part_title": "Parts and accessories necessary for safe operation",
        "applies_to": "VEHICLE",
        "unit_number": 1,
        "out_of_service": False,
        "category_id": 28,
        "citation_number": None,
    }
    assert (second["applies_to"], second["unit_number"], second["citation_number"]) == (
        "DRIVER",
        None,
        "4A0768979",
    )
    assert (third["unit_number"], third["out_of_service"]) == (2, True)
    assert values.violation_data["viol_total"] == 3  # header counts are kept alongside


def test_inspection_without_violations_has_an_empty_list() -> None:
    headers, units = load_inspection_rows()

    assert normalize_inspection(headers[0], units).violation_data["violations"] == []


@pytest.mark.parametrize(
    ("part", "title"),
    [
        (395, "Hours of service of drivers"),
        (172, "Hazardous materials regulations"),
        (999, None),  # unknown parts are shown by number only
        (None, None),
    ],
)
def test_cfr_part_title(part: int | None, title: str | None) -> None:
    assert cfr_part_title(part) == title


def test_fetches_violations_for_the_given_inspections() -> None:
    headers, units = load_inspection_rows()
    adapter = VehicleInspectionAdapter(
        inspection_api(headers, units, violations=load_violation_rows())
    )

    assert len(adapter.fetch_violations(["82915718", "86137641"])) == 7
