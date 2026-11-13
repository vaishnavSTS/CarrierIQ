"""Where a carrier operates, whether it hauls hazardous materials and what cargo it carries, from
its latest Company Census row (as the carrier reported it on its MCS-150). Pure function."""

from typing import Any

from app.schemas.carrier_profile import OperationOut

# CARRIER_OPERATION codes from the MCMIS Company Census data dictionary.
OPERATIONS = {
    "A": "INTERSTATE",
    "B": "INTRASTATE_HAZMAT",
    "C": "INTRASTATE_NON_HAZMAT",
}

# Cargo classifications on the MCS-150 (census CRGO_* fields, "X" when checked), in form order.
CARGO = (
    ("crgo_genfreight", "General freight"),
    ("crgo_household", "Household goods"),
    ("crgo_metalsheet", "Metal: sheets, coils, rolls"),
    ("crgo_motoveh", "Motor vehicles"),
    ("crgo_drivetow", "Drive away / towaway"),
    ("crgo_logpole", "Logs, poles, beams, lumber"),
    ("crgo_bldgmat", "Building materials"),
    ("crgo_mobilehome", "Mobile homes"),
    ("crgo_machlrg", "Machinery, large objects"),
    ("crgo_produce", "Fresh produce"),
    ("crgo_liqgas", "Liquids / gases"),
    ("crgo_intermodal", "Intermodal containers"),
    ("crgo_passengers", "Passengers"),
    ("crgo_oilfield", "Oilfield equipment"),
    ("crgo_livestock", "Livestock"),
    ("crgo_grainfeed", "Grain, feed, hay"),
    ("crgo_coalcoke", "Coal / coke"),
    ("crgo_meat", "Meat"),
    ("crgo_garbage", "Garbage / refuse"),
    ("crgo_usmail", "U.S. mail"),
    ("crgo_chem", "Chemicals"),
    ("crgo_drybulk", "Commodities dry bulk"),
    ("crgo_coldfood", "Refrigerated food"),
    ("crgo_beverages", "Beverages"),
    ("crgo_paperprod", "Paper products"),
    ("crgo_utility", "Utilities"),
    ("crgo_farmsupp", "Agricultural / farm supplies"),
    ("crgo_construct", "Construction"),
    ("crgo_waterwell", "Water well"),
)


def _count(row: dict[str, Any], name: str) -> int | None:
    try:
        return int(float(str(row[name]).strip()))
    except (KeyError, TypeError, ValueError):
        return None


def _checked(row: dict[str, Any], name: str) -> bool:
    return str(row.get(name) or "").strip().upper() in ("X", "Y")


def operation_from_census(row: dict[str, Any] | None) -> OperationOut | None:
    """None when there is no census row to read."""
    if not row:
        return None
    operation = OPERATIONS.get(str(row.get("carrier_operation") or "").strip().upper())
    hm = str(row.get("hm_ind") or "").strip().upper()
    cargo = [label for field, label in CARGO if _checked(row, field)]
    if _checked(row, "crgo_cargoothr"):
        other = str(row.get("crgo_cargoothr_desc") or "").strip()
        cargo.append(f"Other: {other.title()}" if other else "Other")
    return OperationOut(
        operation=operation,
        # Intrastate hazmat (B) is hazmat even if HM_IND is blank.
        hazmat=True if hm == "Y" or operation == "INTRASTATE_HAZMAT" else False if hm else None,
        interstate_drivers=_count(row, "driver_inter_total"),
        intrastate_drivers=_count(row, "total_intrastate_drivers"),
        cdl_drivers=_count(row, "total_cdl"),
        interstate_beyond_100_miles=_count(row, "interstate_beyond_100_miles"),
        interstate_within_100_miles=_count(row, "interstate_within_100_miles"),
        intrastate_beyond_100_miles=_count(row, "intrastate_beyond_100_miles"),
        intrastate_within_100_miles=_count(row, "intrastate_within_100_miles"),
        cargo=cargo,
    )
