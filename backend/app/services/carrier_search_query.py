"""Classify and clean what a user typed into the search box (spec Section 5.1, Section 21).

- digits (optionally "USDOT"/"DOT" first)  -> USDOT number
- MC / MX / FF followed by digits          -> docket
- anything else (3+ characters)            -> carrier name

Cleaned values are safe to place in a SoQL expression: identifiers are digits only and names
keep only letters, digits, spaces and & . , ' / - (quotes are escaped by the adapter).
"""

import re
from dataclasses import dataclass
from enum import StrEnum

from app.core.exceptions import ValidationError
from app.models.enums import DocketPrefix

MAX_USDOT_DIGITS = 8  # USDOT_NUMBER is 8 digits in the census data dictionary
MAX_DOCKET_DIGITS = 8
MIN_NAME_LENGTH = 3

_USDOT = re.compile(r"^(?:US)?(?:DOT)?#?(\d+)$")
_DOCKET = re.compile(r"^(MC|MX|FF)#?(\d+)$")
_NAME_DISALLOWED = re.compile(r"[^A-Z0-9 &.,'/-]")


class SearchKind(StrEnum):
    USDOT = "usdot"
    DOCKET = "docket"
    NAME = "name"


@dataclass(frozen=True)
class SearchQuery:
    kind: SearchKind
    usdot_number: int | None = None
    docket_prefix: DocketPrefix | None = None
    docket_number: str | None = None
    name: str | None = None


def parse_search_query(text: str) -> SearchQuery:
    upper = " ".join(text.upper().split())
    compact = re.sub(r"[\s\-:.]", "", upper)

    if match := _USDOT.match(compact):
        digits = match.group(1)
        if len(digits) > MAX_USDOT_DIGITS or int(digits) == 0:
            raise ValidationError(f"{text.strip()!r} is not a valid USDOT number")
        return SearchQuery(SearchKind.USDOT, usdot_number=int(digits))

    if match := _DOCKET.match(compact):
        prefix, digits = match.groups()
        number = digits.lstrip("0")  # the census stores docket numbers without leading zeros
        if not number or len(number) > MAX_DOCKET_DIGITS:
            raise ValidationError(f"{text.strip()!r} is not a valid docket number")
        return SearchQuery(
            SearchKind.DOCKET, docket_prefix=DocketPrefix(prefix), docket_number=number
        )

    name = " ".join(_NAME_DISALLOWED.sub(" ", upper).split())
    if len(name) < MIN_NAME_LENGTH:
        raise ValidationError(
            f"Enter a USDOT number, an MC/MX/FF number, or at least {MIN_NAME_LENGTH} "
            "characters of a carrier name"
        )
    return SearchQuery(SearchKind.NAME, name=name)
