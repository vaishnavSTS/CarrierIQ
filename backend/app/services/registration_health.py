"""Registration health checks for one carrier (Network & Identity tab, Phase 11).

Each check reports what FMCSA's records show and names the record; CarrierIQ is not the
regulator and never states a conclusion of its own (spec Section 14). Where a status depends
on a rule, the rule is attributed to FMCSA. Statuses:
- ok: nothing for a broker's check to react to
- attention: something a broker's vetting tool may flag; usually fixable with paperwork
- alert: an FMCSA order or link that FMCSA rules treat as limiting operation
- info: context worth knowing, not a problem
- unknown: the data needed is not there

Pure function over stored records, so it is easy to test and never fetches anything.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from app.models import Address, Authority, Carrier, Insurance
from app.services.boc3_service import ProcessAgent
from app.services.insurance_renewal import describe, renewals

MCS150_MONTHS = 24  # FMCSA requires an MCS-150 update at least every 24 months
CHECK_STATUSES = ("ok", "attention", "alert", "info", "unknown")


@dataclass(frozen=True)
class Check:
    key: str
    label: str
    status: str
    detail: str
    source: str
    as_of: date | None = None


@dataclass(frozen=True)
class AddressPeer:
    """Another carrier the census lists at the same street address and unit."""

    usdot_number: int
    legal_name: str | None
    street: str | None  # as FMCSA has it on that carrier's record
    undeliverable: bool  # physical or mailing address marked by FMCSA


def _order_date(value: object) -> str:
    day = _yyyymmdd(value)
    return _d(day) if day else str(value or "an unknown date")


def address_peer(usdot_number: int, census_row: dict[str, Any]) -> AddressPeer:
    return AddressPeer(
        usdot_number=usdot_number,
        legal_name=census_row.get("legal_name"),
        street=census_row.get("phy_street"),
        undeliverable=census_row.get("undeliv_phy") == "U"
        or bool(census_row.get("carrier_mailing_und_date")),
    )


MAX_PEERS = 3


def _d(day: date) -> str:
    """May 14, 2026"""
    return f"{day:%B} {day.day}, {day.year}"


def _yyyymmdd(value: object) -> date | None:
    text = str(value or "")
    try:
        if len(text) >= 10 and text[4] == "-":
            return date.fromisoformat(text[:10])
        if len(text) >= 8 and text[:8].isdigit():
            return date(int(text[:4]), int(text[4:6]), int(text[6:8]))
    except ValueError:
        return None
    return None


def registration_checks(
    carrier: Carrier,
    census: dict[str, Any],
    authorities: Sequence[Authority],
    addresses: Sequence[Address],
    oos_orders: Sequence[dict[str, Any]],
    revocations: Sequence[dict[str, Any]],
    legacy_frozen_on: date,
    today: date,
    insurance: Sequence[Insurance] = (),
    address_peers: Sequence[AddressPeer] = (),
    process_agents: Sequence[ProcessAgent] | None = None,
) -> list[Check]:
    checks = [
        _motus(authorities, carrier, legacy_frozen_on),
        _boc3(authorities, process_agents, legacy_frozen_on),
        _mcs150(carrier, today),
        _prior_revoke(carrier, census),
        _oos(oos_orders),
        _revocations(revocations, today),
        _addresses(addresses, census, address_peers),
        *_renewals(insurance, today),
    ]
    return [c for c in checks if c is not None]


def _motus(authorities: Sequence[Authority], carrier: Carrier, frozen: date) -> Check:
    label = "FMCSA registration system"
    if not authorities:
        return Check(
            "motus",
            label,
            "info",
            "No MC, MX or FF number on file, so there is no operating authority to check. "
            "Carriers that haul only their own goods (private carriers) do not need one.",
            "FMCSA census",
        )
    sources = {a.status_source for a in authorities}
    if "MOTUS" in sources:
        return Check(
            "motus",
            label,
            "ok",
            "Authority and insurance are listed in Motus, FMCSA's current system.",
            "FMCSA Motus",
            max((a.status_as_of for a in authorities if a.status_as_of), default=None),
        )
    if "LEGACY_LI" in sources:
        return Check(
            "motus",
            label,
            "attention",
            "Authority and insurance appear only in FMCSA's old L&I system, which stopped "
            f"updating on {_d(frozen)}, and not in Motus, its current system. Brokers' tools "
            "may show them as missing. A common cause: the USDOT number has not been claimed in "
            "Motus yet (FMCSA Portal, Login.gov check). CarrierIQ cannot confirm the status; "
            "the FMCSA Portal shows it.",
            "FMCSA L&I (frozen) / Motus",
            frozen,
        )
    return Check(
        "motus",
        label,
        "unknown",
        f"USDOT {carrier.usdot_number} has a docket on file, but FMCSA's Motus and L&I data "
        "have no authority record for it.",
        "FMCSA census",
    )


def _agent_names(agents: Sequence[ProcessAgent]) -> str:
    names = sorted({f"{a.name} ({a.docket})" if a.docket else a.name for a in agents})
    more = f" and {len(names) - 2} more" if len(names) > 2 else ""
    return " and ".join(names[:2]) + more


def _boc3(
    authorities: Sequence[Authority], agents: Sequence[ProcessAgent] | None, frozen: date
) -> Check | None:
    """BOC-3 process agent filing; only for carriers with an MC/MX/FF docket."""
    if not authorities:
        return None
    label = "Process agent (BOC-3)"
    if agents is None:
        return Check(
            "boc3",
            label,
            "unknown",
            "BOC-3 data not loaded yet. Use Refresh now.",
            "FMCSA BOC-3",
        )
    # Missing BOC-3 matters while the authority is active; otherwise it is context.
    level = (
        "attention"
        if any((a.status or "").upper().startswith("ACTIVE") for a in authorities)
        else "info"
    )
    motus = [a for a in agents if a.source_system == "MOTUS"]
    legacy = [a for a in agents if a.source_system == "LEGACY_LI"]
    if motus:
        return Check(
            "boc3",
            label,
            "ok",
            f"FMCSA's current system (Motus) lists {_agent_names(motus)} as process agent.",
            "FMCSA Motus BOC-3",
        )
    if legacy:
        return Check(
            "boc3",
            label,
            level,
            f"FMCSA's old L&I system lists {_agent_names(legacy)} as process agent, but "
            "FMCSA's current system (Motus) lists none. Brokers' tools may show the BOC-3 as "
            "missing.",
            "FMCSA BOC-3 (L&I frozen / Motus)",
            frozen,
        )
    return Check(
        "boc3",
        label,
        level,
        "FMCSA lists no process agent for this carrier. A for-hire carrier needs a BOC-3 on "
        "file to keep its authority, and to get a revoked authority back.",
        "FMCSA BOC-3",
    )


def _mcs150(carrier: Carrier, today: date) -> Check:
    label = "MCS-150 update"
    filed = carrier.last_mcs150_date
    if filed is None:
        return Check("mcs150", label, "unknown", "No MCS-150 date on file.", "FMCSA census")
    due = filed + timedelta(days=round(MCS150_MONTHS * 365.25 / 12))
    if today > due:
        return Check(
            "mcs150",
            label,
            "attention",
            f"Last updated {_d(filed)}, more than two years ago. FMCSA requires an update "
            "every two years and can deactivate the USDOT number when it is overdue.",
            "FMCSA census",
            filed,
        )
    return Check(
        "mcs150",
        label,
        "ok",
        f"Last updated {_d(filed)}. Next update due by {_d(due)}.",
        "FMCSA census",
        filed,
    )


def _prior_revoke(carrier: Carrier, census: dict[str, Any]) -> Check:
    label = "Prior revocation link"
    if census.get("prior_revoke_flag") != "Y":
        return Check(
            "prior_revoke",
            label,
            "ok",
            "No link to a previously revoked USDOT number.",
            "FMCSA census",
        )
    other = str(census.get("prior_revoke_dot_number") or "")
    if other and other != str(carrier.usdot_number):
        return Check(
            "prior_revoke",
            label,
            "alert",
            f"FMCSA links this carrier to revoked USDOT {other}. The record does not say how "
            "the two are connected, so the relationship is worth asking about.",
            "FMCSA census",
        )
    return Check(
        "prior_revoke",
        label,
        "info",
        "This USDOT number itself had a revocation in the past.",
        "FMCSA census",
    )


def _oos(orders: Sequence[dict[str, Any]]) -> Check:
    label = "Out-of-service orders"
    active = [o for o in orders if str(o.get("status", "")).upper() == "ACTIVE"]
    if active:
        newest = max(active, key=lambda o: str(o.get("oos_date", "")))
        return Check(
            "oos",
            label,
            "alert",
            f"Active out-of-service order since {_order_date(newest.get('oos_date'))}: "
            f"{newest.get('oos_reason', 'reason not given')}. The carrier may not operate until "
            "FMCSA lifts it.",
            "FMCSA Out of Service Orders",
            _yyyymmdd(newest.get("oos_date")),
        )
    if orders:
        return Check(
            "oos",
            label,
            "info",
            f"{len(orders)} past out-of-service order(s), none active now.",
            "FMCSA Out of Service Orders",
        )
    return Check(
        "oos",
        label,
        "ok",
        "No out-of-service orders.",
        "FMCSA Out of Service Orders",
    )


def _revocations(orders: Sequence[dict[str, Any]], today: date) -> Check:
    label = "Authority revocations and suspensions"
    if not orders:
        return Check(
            "revocations",
            label,
            "ok",
            "No revocation or suspension orders.",
            "FMCSA Motus RevokeSuspend",
        )
    dated = sorted(orders, key=lambda o: str(o.get("order1_serve_date", "")), reverse=True)
    newest = dated[0]
    served = _yyyymmdd(newest.get("order1_serve_date"))
    recent = served is not None and served >= today - timedelta(days=365)
    what = str(newest.get("order1_type_desc") or "an order")
    docket = newest.get("docket_number") or "the carrier's authority"
    return Check(
        "revocations",
        label,
        "attention" if recent else "info",
        f"{len(orders)} revocation or suspension order(s). Latest: {what} on {docket}, served "
        f"{_d(served) if served else 'on an unknown date'}.",
        "FMCSA Motus RevokeSuspend",
        served,
    )


def _peer_note(census: dict[str, Any], peers: Sequence[AddressPeer]) -> str:
    """Other carriers at the same address, and whether FMCSA marks them too."""
    if not peers:
        return ""
    own = census.get("phy_street")
    notes = []
    for p in sorted(peers, key=lambda p: p.usdot_number)[:MAX_PEERS]:
        name = f" ({p.legal_name})" if p.legal_name else ""
        written = (
            f', written "{p.street}" there (this carrier\'s record: "{own}")'
            if p.street and own and p.street != own
            else ""
        )
        marked = (
            "also marks it undeliverable" if p.undeliverable else "does not mark it undeliverable"
        )
        notes.append(f"USDOT {p.usdot_number}{name} at the same address{written}, and {marked}")
    more = f" (and {len(peers) - MAX_PEERS} more)" if len(peers) > MAX_PEERS else ""
    text = f" FMCSA's census also lists {'; '.join(notes)}{more}."
    if any(not p.undeliverable for p in peers):
        text += " It does not say why one record is marked and another is not."
    return text


def _addresses(
    addresses: Sequence[Address], census: dict[str, Any], peers: Sequence[AddressPeer] = ()
) -> Check | None:
    bad = sorted({a.address_type.value.lower() for a in addresses if a.undeliverable})
    if not bad:
        return None
    which = " and ".join(bad)
    plural = "addresses" if len(bad) > 1 else "address"
    marked = _yyyymmdd(census.get("carrier_mailing_und_date"))
    since = f" (mailing address marked {_d(marked)})" if marked else ""
    return Check(
        "address",
        "Address marked undeliverable by FMCSA",
        "attention",
        f"FMCSA's census marks the {which} {plural} as undeliverable{since}: FMCSA mail sent "
        f"there came back. The census does not say why.{_peer_note(census, peers)} Until the "
        "address is corrected on an MCS-150, FMCSA notices (audits, MCS-150 reminders) may "
        "not reach the carrier.",
        "FMCSA census",
        marked,
    )


_TYPE = {"BIPD": "liability (BI&PD)", "CARGO": "cargo", "BOND": "surety bond"}


def _renewals(insurance: Sequence[Insurance], today: date) -> list[Check]:
    """Renewals worth a look: expected soon, or expected after the data stopped updating."""
    checks = []
    for r in renewals(insurance, today):
        if r.state not in ("unconfirmed", "upcoming"):
            continue
        kind = _TYPE.get(r.insurance_type, r.insurance_type.lower())
        checks.append(
            Check(
                f"renewal_{r.insurance_type.lower()}",
                f"Insurance renewal ({kind}, {r.docket})",
                "attention" if r.state == "unconfirmed" else "info",
                describe(r),
                "FMCSA insurance filings",
                r.expected,
            )
        )
    return checks
