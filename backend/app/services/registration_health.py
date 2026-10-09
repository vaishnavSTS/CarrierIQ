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
) -> list[Check]:
    checks = [
        _motus(authorities, carrier, legacy_frozen_on),
        _mcs150(carrier, today),
        _prior_revoke(carrier, census),
        _oos(oos_orders),
        _revocations(revocations, today),
        _addresses(addresses, census),
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
            "FMCSA's census lists no MC/MX/FF docket for this carrier, so there is no operating "
            "authority record to look up. Under FMCSA rules, carriers that only haul their own "
            "goods (private carriers) do not need one.",
            "FMCSA census",
        )
    sources = {a.status_source for a in authorities}
    if "MOTUS" in sources:
        return Check(
            "motus",
            label,
            "ok",
            "FMCSA's public Motus data (its current registration system) lists this carrier's "
            "authority and insurance.",
            "FMCSA Motus",
            max((a.status_as_of for a in authorities if a.status_as_of), default=None),
        )
    if "LEGACY_LI" in sources:
        return Check(
            "motus",
            label,
            "attention",
            "In FMCSA's public data, this carrier's authority and insurance appear only in the "
            f"old L&I system, which FMCSA stopped updating on {frozen.isoformat()}, and not in "
            "Motus, its current system. One possible reason is that the USDOT number has not "
            "been claimed in Motus yet (done in the FMCSA Portal with a Login.gov identity "
            "check); the public files can also lag. CarrierIQ cannot confirm the status; the "
            "FMCSA Portal shows it. Broker tools that read current FMCSA data may show the "
            "authority or insurance as missing or out of date.",
            "FMCSA L&I (frozen) / Motus",
            frozen,
        )
    return Check(
        "motus",
        label,
        "unknown",
        f"FMCSA's census lists a docket for USDOT {carrier.usdot_number}, but no authority "
        "record was found for it in FMCSA's public Motus or old L&I data.",
        "FMCSA census",
    )


def _mcs150(carrier: Carrier, today: date) -> Check:
    label = "MCS-150 update"
    filed = carrier.last_mcs150_date
    if filed is None:
        return Check(
            "mcs150", label, "unknown", "FMCSA's census lists no MCS-150 date.", "FMCSA census"
        )
    due = filed + timedelta(days=round(MCS150_MONTHS * 365.25 / 12))
    if today > due:
        return Check(
            "mcs150",
            label,
            "attention",
            f"FMCSA's census lists the last MCS-150 update as {filed.isoformat()}, more than "
            f"{MCS150_MONTHS} months ago. FMCSA requires an update every two years and can "
            "deactivate a USDOT number when it is overdue; brokers may also treat the record "
            "as out of date.",
            "FMCSA census",
            filed,
        )
    return Check(
        "mcs150",
        label,
        "ok",
        f"FMCSA's census lists the last MCS-150 update as {filed.isoformat()}; under FMCSA's "
        f"two-year rule the next is due by {due.isoformat()}.",
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
            "FMCSA's census does not list a prior revoked USDOT number for this carrier.",
            "FMCSA census",
        )
    other = str(census.get("prior_revoke_dot_number") or "")
    if other and other != str(carrier.usdot_number):
        return Check(
            "prior_revoke",
            label,
            "alert",
            f"FMCSA's census lists USDOT {other} in its prior-revocation field for this "
            "carrier. The census does not say how the two are connected. A relationship to "
            "review, not a finding.",
            "FMCSA census",
        )
    return Check(
        "prior_revoke",
        label,
        "info",
        "FMCSA's census records a past revocation for this USDOT number itself.",
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
            "FMCSA lists an active out-of-service order since "
            f"{newest.get('oos_date', 'an unknown date')}: "
            f"{newest.get('oos_reason', 'reason not given')}. Under FMCSA rules, a carrier with "
            "an active out-of-service order may not operate until it is rescinded.",
            "FMCSA Out of Service Orders",
            _yyyymmdd(newest.get("oos_date")),
        )
    if orders:
        return Check(
            "oos",
            label,
            "info",
            f"FMCSA lists {len(orders)} earlier out-of-service order(s), none active now.",
            "FMCSA Out of Service Orders",
        )
    return Check(
        "oos",
        label,
        "ok",
        "FMCSA lists no out-of-service orders for this carrier.",
        "FMCSA Out of Service Orders",
    )


def _revocations(orders: Sequence[dict[str, Any]], today: date) -> Check:
    label = "Authority revocations and suspensions"
    if not orders:
        return Check(
            "revocations",
            label,
            "ok",
            "FMCSA's current system (Motus) lists no revocation or suspension orders.",
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
        f"FMCSA's current system lists {len(orders)} revocation or suspension order(s); "
        f"most recent: {what} on {docket}, served "
        f"{served.isoformat() if served else 'on an unknown date'}.",
        "FMCSA Motus RevokeSuspend",
        served,
    )


def _addresses(addresses: Sequence[Address], census: dict[str, Any]) -> Check | None:
    bad = sorted({a.address_type.value.lower() for a in addresses if a.undeliverable})
    if not bad:
        return None
    which = " and ".join(bad)
    plural = "addresses" if len(bad) > 1 else "address"
    marked = _yyyymmdd(census.get("carrier_mailing_und_date"))
    since = f" (mailing address marked on {marked.isoformat()})" if marked else ""
    return Check(
        "address",
        "Address marked undeliverable by FMCSA",
        "attention",
        f"FMCSA's census marks the {which} {plural} as undeliverable{since}: FMCSA mail sent "
        "there was returned. The census does not say why. FMCSA mail, such as audit or "
        "MCS-150 notices, may not reach the carrier until the address is corrected or "
        "confirmed on an MCS-150.",
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
