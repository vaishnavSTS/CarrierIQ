"""Registration health checks for one carrier (Network & Identity tab, Phase 11).

Each check is a plain statement of what FMCSA records show, with a status:
- ok: nothing for a broker's check to react to
- attention: something a broker's vetting tool may flag; usually fixable with paperwork
- alert: an FMCSA order or link that stops or seriously limits operation
- info: context worth knowing, not a problem
- unknown: the data needed is not there

Pure function over stored records, so it is easy to test and never fetches anything.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from app.models import Address, Authority, Carrier

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
) -> list[Check]:
    checks = [
        _motus(authorities, carrier, legacy_frozen_on),
        _mcs150(carrier, today),
        _prior_revoke(carrier, census),
        _oos(oos_orders),
        _revocations(revocations, today),
        _addresses(addresses),
    ]
    return [c for c in checks if c is not None]


def _motus(authorities: Sequence[Authority], carrier: Carrier, frozen: date) -> Check:
    label = "FMCSA registration system"
    if not authorities:
        return Check(
            "motus",
            label,
            "info",
            "No MC/MX/FF docket on file, so there is no operating authority to look up. Carriers "
            "that only haul their own goods (private carriers) do not need one.",
            "FMCSA census",
        )
    sources = {a.status_source for a in authorities}
    if "MOTUS" in sources:
        return Check(
            "motus",
            label,
            "ok",
            "Authority and insurance appear in Motus, FMCSA's current registration system.",
            "FMCSA Motus",
            max((a.status_as_of for a in authorities if a.status_as_of), default=None),
        )
    if "LEGACY_LI" in sources:
        return Check(
            "motus",
            label,
            "attention",
            "Authority and insurance appear only in FMCSA's old L&I system, which stopped "
            f"updating on {frozen.isoformat()}, and not in Motus, its current system. The "
            "company may not have claimed its USDOT number in Motus yet (done in the FMCSA "
            "Portal with a Login.gov identity check). Broker tools that read current FMCSA "
            "data may show its authority or insurance as missing or out of date.",
            "FMCSA L&I (frozen) / Motus",
            frozen,
        )
    return Check(
        "motus",
        label,
        "unknown",
        f"Only the census docket status is known for USDOT {carrier.usdot_number}; no "
        "authority record was found in Motus or the old L&I system.",
        "FMCSA census",
    )


def _mcs150(carrier: Carrier, today: date) -> Check:
    label = "MCS-150 update"
    filed = carrier.last_mcs150_date
    if filed is None:
        return Check("mcs150", label, "unknown", "No MCS-150 date in the census.", "FMCSA census")
    due = filed + timedelta(days=round(MCS150_MONTHS * 365.25 / 12))
    if today > due:
        return Check(
            "mcs150",
            label,
            "attention",
            f"Last MCS-150 update {filed.isoformat()}, more than {MCS150_MONTHS} months ago. "
            "FMCSA requires an update every two years; an overdue MCS-150 can lead to the "
            "USDOT number being deactivated, and brokers may treat the record as stale.",
            "FMCSA census",
            filed,
        )
    return Check(
        "mcs150",
        label,
        "ok",
        f"Last MCS-150 update {filed.isoformat()}; next due by {due.isoformat()}. Check that "
        "the fleet, drivers and contact details on it are still correct.",
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
            "FMCSA does not link this USDOT number to a previously revoked one.",
            "FMCSA census",
        )
    other = str(census.get("prior_revoke_dot_number") or "")
    if other and other != str(carrier.usdot_number):
        return Check(
            "prior_revoke",
            label,
            "alert",
            f"FMCSA links this carrier to USDOT {other}, which previously had its "
            "registration revoked. This is FMCSA's own flag for possibly related or "
            "reincarnated carriers; it is a relationship to review, not a finding.",
            "FMCSA census",
        )
    return Check(
        "prior_revoke",
        label,
        "info",
        "FMCSA records that this USDOT number itself had a revocation in the past.",
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
            f"Active out-of-service order since {newest.get('oos_date', 'an unknown date')}: "
            f"{newest.get('oos_reason', 'reason not given')}. The carrier may not operate "
            "until it is rescinded.",
            "FMCSA Out of Service Orders",
            _yyyymmdd(newest.get("oos_date")),
        )
    if orders:
        return Check(
            "oos",
            label,
            "info",
            f"{len(orders)} earlier out-of-service order(s), none active now.",
            "FMCSA Out of Service Orders",
        )
    return Check("oos", label, "ok", "No out-of-service orders.", "FMCSA Out of Service Orders")


def _revocations(orders: Sequence[dict[str, Any]], today: date) -> Check:
    label = "Authority revocations and suspensions"
    if not orders:
        return Check(
            "revocations",
            label,
            "ok",
            "No revocation or suspension orders in FMCSA's current system.",
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
        f"{len(orders)} revocation or suspension order(s); most recent: {what} on "
        f"{docket}, served {served.isoformat() if served else 'on an unknown date'}.",
        "FMCSA Motus RevokeSuspend",
        served,
    )


def _addresses(addresses: Sequence[Address]) -> Check | None:
    bad = [a for a in addresses if a.undeliverable]
    if not bad:
        return None
    kinds = ", ".join(sorted(a.address_type.value.lower() for a in bad))
    return Check(
        "address",
        "Undeliverable address",
        "attention",
        f"FMCSA marked the {kinds} address as undeliverable. FMCSA mail (audits, notices) "
        "may not reach the carrier; update the address on the MCS-150.",
        "FMCSA census",
    )
