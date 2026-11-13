"""Interstate/intrastate, hazmat and cargo from a census row (pure, no database)."""

from app.services.carrier_operation import operation_from_census

# DOT 2306585 as the live Company Census returned it on 2026-11-12 (operation fields only).
STINGRAY = {
    "carrier_operation": "A",
    "hm_ind": "Y",
    "crgo_genfreight": "X",
    "crgo_chem": "X",
    "driver_inter_total": "2",
    "total_intrastate_drivers": "0",
    "total_cdl": "2",
    "interstate_beyond_100_miles": "2",
    "interstate_within_100_miles": "0",
    "intrastate_beyond_100_miles": "0",
    "intrastate_within_100_miles": "0",
}


def test_interstate_hazmat_carrier() -> None:
    op = operation_from_census(STINGRAY)
    assert op is not None
    assert (op.operation, op.hazmat) == ("INTERSTATE", True)
    assert op.cargo == ["General freight", "Chemicals"]
    assert (op.interstate_drivers, op.intrastate_drivers, op.cdl_drivers) == (2, 0, 2)
    assert op.interstate_beyond_100_miles == 2


def test_intrastate_codes() -> None:
    hazmat = operation_from_census({"carrier_operation": "B"})
    plain = operation_from_census({"carrier_operation": "C", "hm_ind": "N"})
    assert hazmat is not None and plain is not None
    # Intrastate hazmat counts as hazmat even when HM_IND is blank.
    assert (hazmat.operation, hazmat.hazmat) == ("INTRASTATE_HAZMAT", True)
    assert (plain.operation, plain.hazmat) == ("INTRASTATE_NON_HAZMAT", False)


def test_missing_values_stay_unknown() -> None:
    op = operation_from_census({"carrier_operation": "Z", "driver_inter_total": "n/a"})
    assert op is not None
    assert (op.operation, op.hazmat, op.interstate_drivers, op.cargo) == (None, None, None, [])
    assert operation_from_census(None) is None
    assert operation_from_census({}) is None


def test_other_cargo_keeps_its_description() -> None:
    op = operation_from_census({"crgo_cargoothr": "X", "crgo_cargoothr_desc": "AUTO PARTS"})
    assert op is not None and op.cargo == ["Other: Auto Parts"]
