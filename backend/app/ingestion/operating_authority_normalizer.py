"""Operating-authority rows -> canonical values (spec Section 19.3). Pure functions.

Codes follow the USDOT Motus Operating Authority Data Dictionary (as of 2026-05-18), which also
documents the legacy L&I fields. Observed differences from that document, checked against the
same policy/docket in both systems on 2026-10-08:
- Motus amounts are in dollars ("1000000.00"); legacy amounts are in thousands ("01000").
- Motus dates are YYYYMMDD; legacy dates are MM/DD/YYYY.
"""

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from app.ingestion.fmcsa_values import dollars, mdy, text, thousands, upper, yes, yyyymmdd
from app.models.enums import DocketPrefix

Row = dict[str, Any]

MOTUS = "MOTUS"
LEGACY = "LEGACY_LI"

_DOCKET = re.compile(r"^(MC|MX|FF)0*(\d+)$")

# Legacy authority kinds (COMMON_STAT etc.) and cargo classes (PROPERTY_CHK etc.).
_LEGACY_KINDS = (
    ("common", "Common carrier"),
    ("contract", "Contract carrier"),
    ("broker", "Broker"),
)
_LEGACY_CLASSES = (
    ("property_chk", "Property"),
    ("passenger_chk", "Passengers"),
    ("hhg_chk", "Household goods"),
    ("private_auth_chk", "Private"),
    ("enterprise_chk", "Enterprise"),
)


@dataclass(frozen=True)
class CurrentAuthorityValues:
    docket_prefix: DocketPrefix
    docket_number: str
    authority_type: str | None
    status: str | None  # ACTIVE | PENDING | INACTIVE | WITHDRAWN
    status_source: str  # MOTUS | LEGACY_LI
    status_as_of: date | None
    bipd_required: Decimal | None  # dollars
    bipd_on_file: Decimal | None  # dollars
    cargo_required: bool | None
    cargo_on_file: bool | None
    bond_required: bool | None
    bond_on_file: bool | None
    revocation_pending: bool | None


@dataclass(frozen=True)
class AuthorityEventValues:
    docket_prefix: DocketPrefix
    docket_number: str
    authority_type: str | None
    event_kind: str  # STATUS | ORIGINAL | DISPOSITION
    action: str
    status: str | None
    reason: str | None
    action_date: date | None
    source_system: str


def parse_docket(value: str | None) -> tuple[DocketPrefix, str] | None:
    """ "MC0139446" -> (MC, "139446"); None for anything that isn't an MC/MX/FF docket."""
    match = _DOCKET.match((value or "").strip().upper())
    return (DocketPrefix(match.group(1)), match.group(2)) if match else None


def motus_current(row: Row, as_of: date) -> CurrentAuthorityValues | None:
    docket = parse_docket(row.get("docket_number"))
    if docket is None:
        return None
    return CurrentAuthorityValues(
        docket_prefix=docket[0],
        docket_number=docket[1],
        authority_type=text(row, "op_auth_type"),
        status=upper(row, "op_auth_status"),
        status_source=MOTUS,
        status_as_of=as_of,
        bipd_required=dollars(row, "min_cov_amount"),
        bipd_on_file=dollars(row, "bipd_file"),
        cargo_required=yes(row, "cargo_req"),
        cargo_on_file=yes(row, "cargo_file"),
        bond_required=yes(row, "bond_req"),
        bond_on_file=yes(row, "bond_file"),
        revocation_pending=None,  # not in Motus
    )


def legacy_current(row: Row, frozen_on: date) -> CurrentAuthorityValues | None:
    docket = parse_docket(row.get("docket_number"))
    if docket is None:
        return None
    stats = [upper(row, f"{kind}_stat") for kind, _ in _LEGACY_KINDS]
    pending = any(yes(row, f"{kind}_app_pend") for kind, _ in _LEGACY_KINDS)
    if "A" in stats:
        status: str | None = "ACTIVE"
    elif pending:
        status = "PENDING"
    elif "I" in stats:
        status = "INACTIVE"
    else:
        status = None
    return CurrentAuthorityValues(
        docket_prefix=docket[0],
        docket_number=docket[1],
        authority_type=_legacy_type(row),
        status=status,
        status_source=LEGACY,
        status_as_of=frozen_on,
        bipd_required=thousands(row, "min_cov_amount"),
        bipd_on_file=thousands(row, "bipd_file"),
        cargo_required=yes(row, "cargo_req"),
        cargo_on_file=yes(row, "cargo_file"),
        bond_required=yes(row, "bond_req"),
        bond_on_file=yes(row, "bond_file"),
        revocation_pending=any(yes(row, f"{kind}_rev_pend") for kind, _ in _LEGACY_KINDS),
    )


def motus_events(row: Row) -> list[AuthorityEventValues]:
    docket = parse_docket(row.get("docket_number"))
    status = upper(row, "op_auth_status")
    reason = text(row, "reason")
    if docket is None or (status is None and reason is None):
        return []
    return [
        AuthorityEventValues(
            docket_prefix=docket[0],
            docket_number=docket[1],
            authority_type=text(row, "op_auth_type"),
            event_kind="STATUS",
            action=(reason or status or "").upper(),
            status=status,
            reason=reason,
            action_date=yyyymmdd(row, "status_change_date"),
            source_system=MOTUS,
        )
    ]


def legacy_events(row: Row) -> list[AuthorityEventValues]:
    """A legacy row holds the original action and, once decided, its disposition."""
    docket = parse_docket(row.get("docket_number"))
    if docket is None:
        return []
    authority_type = text(row, "mod_col_1")  # OP_AUTH_TYPE
    events = []
    original = upper(row, "original_action_desc")
    if original:
        events.append(
            AuthorityEventValues(
                docket[0],
                docket[1],
                authority_type,
                "ORIGINAL",
                original,
                None,
                None,
                mdy(row, "orig_served_date"),
                LEGACY,
            )
        )
    disposition = upper(row, "disp_action_desc")
    if disposition:
        events.append(
            AuthorityEventValues(
                docket[0],
                docket[1],
                authority_type,
                "DISPOSITION",
                disposition,
                None,
                None,
                mdy(row, "disp_served_date") or mdy(row, "disp_decided_date"),
                LEGACY,
            )
        )
    return events


def _legacy_type(row: Row) -> str | None:
    kinds = [label for kind, label in _LEGACY_KINDS if upper(row, f"{kind}_stat") in ("A", "I")]
    classes = [label for field, label in _LEGACY_CLASSES if yes(row, field)]
    if not kinds and not classes:
        return None
    text = " / ".join(kinds) or "Authority"
    return f"{text} ({', '.join(classes)})" if classes else text
