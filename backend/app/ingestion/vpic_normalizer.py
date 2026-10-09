"""NHTSA vPIC decode result -> vehicle values. Pure.

vPIC returns "" for unknown values. ErrorCode is "0" for a clean decode, otherwise one or more
comma-separated codes, e.g. "1" (check digit does not calculate) or "1,7,11,400".
"""

from dataclasses import dataclass
from typing import Any

Row = dict[str, Any]


@dataclass(frozen=True)
class DecodedVehicle:
    vin: str
    decoded_make: str | None
    decoded_model: str | None
    decoded_year: int | None
    decoded_body_class: str | None
    decoded_vehicle_type: str | None
    decoded_gvwr: str | None
    decoded_manufacturer: str | None
    decode_error_code: str | None
    decode_error_text: str | None
    check_digit_valid: bool | None


def decoded_vehicle(row: Row) -> DecodedVehicle | None:
    vin = _text(row, "VIN")
    if vin is None:
        return None
    codes = [c.strip() for c in (_text(row, "ErrorCode") or "").split(",") if c.strip()]
    year = _text(row, "ModelYear")
    return DecodedVehicle(
        vin=vin.upper(),
        decoded_make=_text(row, "Make"),
        decoded_model=_text(row, "Model"),
        decoded_year=int(year) if year and year.isdigit() else None,
        decoded_body_class=_text(row, "BodyClass"),
        decoded_vehicle_type=_text(row, "VehicleType"),
        decoded_gvwr=_text(row, "GVWR"),
        decoded_manufacturer=_text(row, "Manufacturer"),
        decode_error_code=",".join(codes) or None,
        decode_error_text=_text(row, "ErrorText"),
        check_digit_valid=None if not codes else "1" not in codes,
    )


def _text(row: Row, field: str) -> str | None:
    value = row.get(field)
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned or None
