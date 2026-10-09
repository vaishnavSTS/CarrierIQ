"""Find other carriers that share a carrier's contact details in the Company Census File.

Pure functions: build one SoQL filter matching any of a carrier's phones, email, physical street
address or officer names, then say which of those each returned row shares. Spec Sections 11.4
(SHARES_PHONE / SHARES_ADDRESS / SHARES_OFFICER relationships) and 29 (identity history).

Values reach the filter only after normalization (digits, upper case, no quotes or LIKE
wildcards), so a census value can never change the query's meaning.
"""

import re
from dataclasses import dataclass, field

from app.ingestion.company_census_normalizer import normalize_phone
from app.ingestion.socrata_client import Row

PHONE_FIELDS = ("phone", "cell_phone", "fax")
OFFICER_FIELDS = ("company_officer_1", "company_officer_2")

# Shared contact kinds, strongest first.
PHONE = "phone"
EMAIL = "email"
ADDRESS = "address"  # same street address including the unit
BUILDING = "building"  # same street address, different (or no) unit
OFFICER = "officer"

# A unit designator and everything after it:
# "7799 VALLEY VIEW ST APT H103" -> "7799 VALLEY VIEW ST".
_UNIT = re.compile(r"\s+(?:(?:APT|APARTMENT|UNIT|STE|SUITE|BLDG|SPC|SPACE|LOT|RM|ROOM|FL)\b|#).*$")
# A trailing bare unit after a street-type word: "7799 VALLEY VIEW ST G103" -> "... ST".
_TRAILING_UNIT = re.compile(
    r"\b(ST|AVE|RD|DR|BLVD|LN|WAY|CT|PL|PKWY|HWY|CIR|TER|TRL)\s+#?[A-Z]?\d+[A-Z]?$"
)
_UNSAFE = re.compile(r"['%_\\]")
MIN_OFFICER_LENGTH = 6  # skip initials and fragments that would match strangers


def clean(value: str | None) -> str:
    """Upper case, single spaces, and no characters that could alter a SoQL string literal."""
    return " ".join(_UNSAFE.sub("", (value or "").upper()).split())


def street_base(street: str | None) -> str:
    """The building part of a street address (number + street), without any unit."""
    text = clean(street).replace("#", " # ")
    text = " ".join(text.split())
    text = _UNIT.sub("", text)
    text = _TRAILING_UNIT.sub(r"\1", text)
    return text.strip()


def zip5(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    return digits[:5] if len(digits) >= 5 else ""


@dataclass(frozen=True)
class ContactKeys:
    """The details of one carrier to look for on other carriers."""

    phones: tuple[str, ...] = ()
    email: str = ""
    street: str = ""  # full street, cleaned (unit included)
    zip: str = ""
    officers: tuple[str, ...] = ()

    @property
    def building(self) -> str:
        return street_base(self.street)

    def is_empty(self) -> bool:
        return not (self.phones or self.email or (self.building and self.zip) or self.officers)


@dataclass
class Match:
    """What one other census row shares with the carrier."""

    kinds: set[str] = field(default_factory=set)
    values: dict[str, str] = field(default_factory=dict)  # kind -> the shared value


def keys_for(
    phones: list[str],
    email: str | None,
    street: str | None,
    zip_code: str | None,
    officers: list[str],
) -> ContactKeys:
    return ContactKeys(
        phones=tuple(sorted({p for p in (normalize_phone(x) for x in phones) if p})),
        email=clean(email) if email and "@" in email else "",
        street=clean(street),
        zip=zip5(zip_code),
        officers=tuple(
            sorted({o for o in (clean(x) for x in officers) if len(o) >= MIN_OFFICER_LENGTH})
        ),
    )


def _in(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


def build_where(keys: ContactKeys) -> str | None:
    """One SoQL $where matching any shared detail; None when there is nothing to look for."""
    parts: list[str] = []
    if keys.phones:
        # The census stores some numbers with the leading country code: match both forms.
        variants = tuple(v for p in keys.phones for v in (p, f"1{p}"))
        parts += [f"{f} in {_in(variants)}" for f in PHONE_FIELDS]
    if keys.email:
        parts.append(f"upper(email_address) = '{keys.email}'")
    if keys.building and keys.zip:
        parts.append(f"(upper(phy_street) like '{keys.building}%' AND phy_zip like '{keys.zip}%')")
    if keys.officers:
        parts += [f"upper({f}) in {_in(keys.officers)}" for f in OFFICER_FIELDS]
    return " OR ".join(parts) if parts else None


def classify(row: Row, keys: ContactKeys) -> Match:
    """Which of the carrier's details this census row shares (an empty match: none)."""
    match = Match()
    for f in PHONE_FIELDS:
        number = normalize_phone(row.get(f) if isinstance(row.get(f), str) else None)
        if number and number in keys.phones:
            match.kinds.add(PHONE)
            match.values[PHONE] = number
    email = clean(row.get("email_address") if isinstance(row.get("email_address"), str) else "")
    if keys.email and email == keys.email:
        match.kinds.add(EMAIL)
        match.values[EMAIL] = email.lower()
    street = clean(row.get("phy_street") if isinstance(row.get("phy_street"), str) else "")
    if keys.building and keys.zip and zip5(row.get("phy_zip")) == keys.zip:
        if street and street == keys.street:
            match.kinds.add(ADDRESS)
            match.values[ADDRESS] = street
        elif street and street_base(street) == keys.building:
            match.kinds.add(BUILDING)
            match.values[BUILDING] = street
    for f in OFFICER_FIELDS:
        name = clean(row.get(f) if isinstance(row.get(f), str) else "")
        if name and name in keys.officers:
            match.kinds.add(OFFICER)
            match.values[OFFICER] = name
    return match
