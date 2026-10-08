"""Value parsing shared by the FMCSA operating-authority and insurance normalizers. Pure."""

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

Row = dict[str, Any]


def text(row: Row, field: str) -> str | None:
    value = row.get(field)
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def upper(row: Row, field: str) -> str | None:
    value = text(row, field)
    return value.upper() if value else None


def yes(row: Row, field: str) -> bool | None:
    value = upper(row, field)
    return None if value is None else value == "Y"


def decimal(row: Row, field: str) -> Decimal | None:
    value = text(row, field)
    if value is None:
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def dollars(row: Row, field: str) -> Decimal | None:
    amount = decimal(row, field)
    return amount.quantize(Decimal("0.01")) if amount is not None else None


def thousands(row: Row, field: str) -> Decimal | None:
    amount = decimal(row, field)
    return (amount * 1000).quantize(Decimal("0.01")) if amount is not None else None


def yyyymmdd(row: Row, field: str) -> date | None:
    value = text(row, field)
    if value is None or len(value) != 8 or not value.isdigit():
        return None
    try:
        return date(int(value[:4]), int(value[4:6]), int(value[6:]))
    except ValueError:
        return None


def mdy(row: Row, field: str) -> date | None:
    value = text(row, field)
    match = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", value or "")
    if not match:
        return None
    try:
        return date(int(match.group(3)), int(match.group(1)), int(match.group(2)))
    except ValueError:
        return None
