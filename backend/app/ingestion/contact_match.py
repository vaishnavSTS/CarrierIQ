"""Find other carriers that share a carrier's contact details in the Company Census File.

Pure functions: build one SoQL filter matching any of a carrier's phones, email, physical street
address or officer names, then say which of those each returned row shares. Spec Sections 11.4
(SHARES_PHONE / SHARES_ADDRESS / SHARES_OFFICER relationships) and 29 (identity history).

For the Chameleon check it also matches the carrier's DUNS number, its mailing address (against
other carriers' physical and mailing addresses) and the phones / addresses it used before (past
values): the details a re-registered ("chameleon") operation tends to keep.

Values reach the filter only after normalization (digits, upper case, no quotes or LIKE
wildcards), so a census value can never change the query's meaning.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.ingestion.company_census_normalizer import normalize_phone
from app.ingestion.socrata_client import Row

PHONE_FIELDS = ("phone", "cell_phone", "fax")
OFFICER_FIELDS = ("company_officer_1", "company_officer_2")
# (street field, zip field) of the census row's physical and mailing addresses.
ADDRESS_FIELDS = (("phy_street", "phy_zip"), ("carrier_mailing_street", "carrier_mailing_zip"))
DUNS_FIELD = "dun_bradstreet_no"

# Shared contact kinds, strongest first.
PHONE = "phone"
EMAIL = "email"
ADDRESS = "address"  # same street address including the unit
BUILDING = "building"  # same street address, different (or no) unit
OFFICER = "officer"
# Chameleon-check kinds (not part of the Network tab's contact links).
DUNS = "duns"  # same Dun & Bradstreet number
MAILING = "mailing"  # same street address and unit, where a mailing address is involved
PAST_PHONE = "past_phone"  # one of the carrier's former phones
PAST_ADDRESS = "past_address"  # one of the carrier's former addresses

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


# USPS standard abbreviations: FMCSA stores addresses as carriers typed them, so the same
# building can be "3920 SOUTH LOOMIS" on one record and "3920 S LOOMIS" on another.
_ABBREVIATIONS = {
    "NORTH": "N",
    "SOUTH": "S",
    "EAST": "E",
    "WEST": "W",
    "NORTHEAST": "NE",
    "NORTHWEST": "NW",
    "SOUTHEAST": "SE",
    "SOUTHWEST": "SW",
    "STREET": "ST",
    "AVENUE": "AVE",
    "AV": "AVE",
    "ROAD": "RD",
    "DRIVE": "DR",
    "BOULEVARD": "BLVD",
    "LANE": "LN",
    "COURT": "CT",
    "PLACE": "PL",
    "PARKWAY": "PKWY",
    "HIGHWAY": "HWY",
    "CIRCLE": "CIR",
    "TERRACE": "TER",
    "TRAIL": "TRL",
    "SUITE": "STE",
    "APARTMENT": "APT",
    "BUILDING": "BLDG",
}
_HOUSE_NUMBER = re.compile(r"^(\d+[A-Z]?)\s")


def normalize_street(street: str | None) -> str:
    """A street address in USPS short form, for comparing two records of the same address."""
    text = re.sub(r"[.,]", " ", clean(street))
    return " ".join(_ABBREVIATIONS.get(word, word) for word in text.split())


def street_base(street: str | None) -> str:
    """The building part of a street address (number + street), without any unit."""
    text = normalize_street(street).replace("#", " # ")
    text = " ".join(text.split())
    text = _UNIT.sub("", text)
    text = _TRAILING_UNIT.sub(r"\1", text)
    return text.strip()


def zip5(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    return digits[:5] if len(digits) >= 5 else ""


def normalize_duns(value: object) -> str:
    """A DUNS number as 9 digits; "" for blanks and placeholders (all one digit, 123456789).

    The census drops leading zeros ("53826913"), so shorter numbers are padded back.
    """
    digits = re.sub(r"\D", "", value if isinstance(value, str) else "")
    if not 7 <= len(digits) <= 9:
        return ""
    digits = digits.zfill(9)
    if len(set(digits)) == 1 or digits == "123456789":
        return ""
    return digits


AddressKey = tuple[str, str]  # (street in USPS short form, ZIP5)


def address_key(street: str | None, zip_code: str | None) -> AddressKey | None:
    """(normalized street, ZIP5), or None when either part is missing."""
    key = (normalize_street(street), zip5(zip_code))
    return key if key[0] and key[1] else None


@dataclass(frozen=True)
class ContactKeys:
    """The details of one carrier to look for on other carriers."""

    phones: tuple[str, ...] = ()
    email: str = ""
    street: str = ""  # full street in USPS short form (unit included)
    zip: str = ""
    officers: tuple[str, ...] = ()
    # Chameleon check only:
    duns: str = ""
    mailing: AddressKey | None = None  # the current mailing address
    past_phones: tuple[str, ...] = ()
    past_addresses: tuple[AddressKey, ...] = ()

    @property
    def current_addresses(self) -> tuple[AddressKey, ...]:
        physical = (self.street, self.zip) if self.street and self.zip else None
        return tuple(a for a in (physical, self.mailing) if a)

    @property
    def building(self) -> str:
        return street_base(self.street)

    @property
    def house_number(self) -> str:
        found = _HOUSE_NUMBER.match(self.street)
        return found.group(1) if found else ""

    def is_empty(self) -> bool:
        return not (
            self.phones
            or self.email
            or (self.building and self.zip)
            or self.officers
            or self.duns
            or self.mailing
            or self.past_phones
            or self.past_addresses
        )


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
    *,
    duns: str | None = None,
    mailing: tuple[str | None, str | None] | None = None,
    past_phones: Sequence[str] = (),
    past_addresses: Sequence[tuple[str | None, str | None]] = (),
) -> ContactKeys:
    current_phones = tuple(sorted({p for p in (normalize_phone(x) for x in phones) if p}))
    former_phones = {p for p in (normalize_phone(x) for x in past_phones) if p}
    mailing_key = address_key(*mailing) if mailing else None
    current = {k for k in (address_key(street, zip_code), mailing_key) if k}
    return ContactKeys(
        phones=current_phones,
        email=clean(email) if email and "@" in email else "",
        street=normalize_street(street),
        zip=zip5(zip_code),
        officers=tuple(
            sorted({o for o in (clean(x) for x in officers) if len(o) >= MIN_OFFICER_LENGTH})
        ),
        duns=normalize_duns(duns),
        mailing=mailing_key,
        past_phones=tuple(sorted(former_phones - set(current_phones))),
        past_addresses=tuple(
            sorted({k for k in (address_key(st, z) for st, z in past_addresses) if k} - current)
        ),
    )


def _in(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


def _address_clause(key: AddressKey, street_field: str, zip_field: str) -> str:
    """By house number and ZIP, so spelling differences still match; classify() decides."""
    street, zip_code = key
    found = _HOUSE_NUMBER.match(street)
    prefix = f"{found.group(1)} " if found else street_base(street)
    return f"(upper({street_field}) like '{prefix}%' AND {zip_field} like '{zip_code}%')"


def build_where(keys: ContactKeys) -> str | None:
    """One SoQL $where matching any shared detail; None when there is nothing to look for."""
    parts: list[str] = []
    phones = keys.phones + keys.past_phones
    if phones:
        # The census stores some numbers with the leading country code: match both forms.
        variants = tuple(v for p in phones for v in (p, f"1{p}"))
        parts += [f"{f} in {_in(variants)}" for f in PHONE_FIELDS]
    if keys.email:
        parts.append(f"upper(email_address) = '{keys.email}'")
    if keys.building and keys.zip:
        # By house number and ZIP, so spelling differences ("SOUTH" / "S") still match;
        # classify() then compares the normalized street.
        prefix = f"{keys.house_number} " if keys.house_number else keys.building
        parts.append(f"(upper(phy_street) like '{prefix}%' AND phy_zip like '{keys.zip}%')")
    if keys.officers:
        parts += [f"upper({f}) in {_in(keys.officers)}" for f in OFFICER_FIELDS]
    if keys.duns:
        # Digits only (normalize_duns), with and without the leading zeros the census drops.
        forms = tuple(sorted({keys.duns, keys.duns.lstrip("0")}))
        parts.append(f"{DUNS_FIELD} in {_in(forms)}")
    # Other carriers' mailing addresses against every address of this carrier, and other
    # carriers' physical addresses against its mailing and past addresses (physical against
    # physical is the clause above).
    for key in keys.current_addresses + keys.past_addresses:
        parts.append(_address_clause(key, *ADDRESS_FIELDS[1]))
    for key in (*([keys.mailing] if keys.mailing else []), *keys.past_addresses):
        parts.append(_address_clause(key, *ADDRESS_FIELDS[0]))
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
    written = clean(row.get("phy_street") if isinstance(row.get("phy_street"), str) else "")
    street = normalize_street(written)
    if keys.building and keys.zip and zip5(row.get("phy_zip")) == keys.zip:
        # The value shown is the other record's address as FMCSA has it.
        if street and street == keys.street:
            match.kinds.add(ADDRESS)
            match.values[ADDRESS] = written
        elif street and street_base(street) == keys.building:
            match.kinds.add(BUILDING)
            match.values[BUILDING] = written
    for f in OFFICER_FIELDS:
        name = clean(row.get(f) if isinstance(row.get(f), str) else "")
        if name and name in keys.officers:
            match.kinds.add(OFFICER)
            match.values[OFFICER] = name
    _classify_chameleon(row, keys, match)
    return match


def _text(row: Row, name: str) -> str:
    value = row.get(name)
    return value if isinstance(value, str) else ""


def _classify_chameleon(row: Row, keys: ContactKeys, match: Match) -> None:
    """DUNS, mailing-address and past-value matches (Chameleon check)."""
    duns = normalize_duns(row.get(DUNS_FIELD))
    if keys.duns and duns == keys.duns:
        match.kinds.add(DUNS)
        match.values[DUNS] = duns
    for f in PHONE_FIELDS:
        number = normalize_phone(_text(row, f) or None)
        if number and number in keys.past_phones:
            match.kinds.add(PAST_PHONE)
            match.values[PAST_PHONE] = number
    physical = (keys.street, keys.zip) if keys.street and keys.zip else None
    for index, (street_field, zip_field) in enumerate(ADDRESS_FIELDS):
        written = clean(_text(row, street_field))
        theirs = address_key(written, _text(row, zip_field))
        if theirs is None:
            continue
        if theirs in keys.current_addresses:
            # Physical against physical is ADDRESS above (and an ADDRESS match already covers the
            # place); any other pairing with a mailing address
            # is MAILING.
            if ADDRESS not in match.kinds and not (index == 0 and theirs == physical):
                match.kinds.add(MAILING)
                match.values.setdefault(MAILING, written)
        elif theirs in keys.past_addresses:
            match.kinds.add(PAST_ADDRESS)
            match.values.setdefault(PAST_ADDRESS, written)
