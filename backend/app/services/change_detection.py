"""Deterministic change detection for authority and insurance (spec Sections 12.1, 12.2, 12.7).

Pure functions over stored records; they produce timeline events, each traced to the raw
record behind it. Wording follows spec Section 14: describe what the records show ("revoked",
"no filing on file"), never a judgement about the carrier. A normal insurer change is reported
as information, not as a concern (spec 12.2).
"""

import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.models import Authority, AuthorityHistory, Insurance
from app.models.enums import Severity
from app.services.insurance_status import is_active_authority

AUTHORITY_PREFIX = "AUTHORITY_"
INSURANCE_PREFIX = "INSURANCE_"


@dataclass(frozen=True)
class TimelineEventValues:
    event_key: str
    event_type: str
    event_date: date
    severity: Severity
    title: str
    description: str
    raw_record_id: int | None


# --- authority ---------------------------------------------------------------------------

# (category, severity, title) checked in order against the upper-cased action / reason.
_AUTHORITY_RULES: tuple[tuple[str, str, Severity, str], ...] = (
    (
        "DISCONTINUED REVOCATION",
        "REVOCATION_DISCONTINUED",
        Severity.INFO,
        "Revocation proceeding discontinued",
    ),
    (
        "INVOLUNTARY REVOCATION",
        "REVOCATION_STARTED",
        Severity.MEDIUM,
        "Revocation proceeding started",
    ),
    ("REVOK", "REVOKED", Severity.HIGH, "Authority revoked"),
    ("REVOCATION", "REVOKED", Severity.HIGH, "Authority revoked"),
    ("SUSPEN", "SUSPENDED", Severity.HIGH, "Authority suspended"),
    ("OUT OF SERVICE", "OUT_OF_SERVICE", Severity.HIGH, "Authority placed out of service"),
    # A transfer moves the authority to another entity: the public record closest to an
    # ownership change. Renumbering re-issues the docket under a new number.
    ("TRANSFER", "TRANSFERRED", Severity.MEDIUM, "Authority transferred"),
    ("RENUMBER", "RENUMBERED", Severity.LOW, "Authority renumbered"),
    ("REINSTAT", "REINSTATED", Severity.INFO, "Authority reinstated"),
    ("GRANTED", "GRANTED", Severity.INFO, "Authority granted"),
    ("INACTIVAT", "INACTIVATED", Severity.MEDIUM, "Authority inactivated"),
    ("WITHDRAWN", "WITHDRAWN", Severity.LOW, "Authority withdrawn"),
    ("DISMISSED", "APPLICATION_NOT_GRANTED", Severity.LOW, "Authority application dismissed"),
    ("DENIED", "APPLICATION_NOT_GRANTED", Severity.LOW, "Authority application denied"),
    ("REJECTED", "APPLICATION_NOT_GRANTED", Severity.LOW, "Authority application rejected"),
    ("EXPIRED", "EXPIRED", Severity.LOW, "Authority expired"),
    ("FAILURE TO REAPPLY", "EXPIRED", Severity.LOW, "Authority lapsed (failure to reapply)"),
)

_EMAIL = re.compile(r"\S+@\S+")


def authority_rule(action: str) -> tuple[str, Severity, str]:
    """(category, severity, title) for an authority action, e.g. ("REVOKED", HIGH, ...)."""
    text = action.upper()
    for needle, category, severity, title in _AUTHORITY_RULES:
        if needle in text:
            return category, severity, title
    return "ACTION", Severity.INFO, "Authority action recorded"


def _safe(text: str | None) -> str | None:
    """Source reasons can name the filer's e-mail ("Withdrawn by x@y.com"); never show it."""
    if not text:
        return None
    return " ".join(_EMAIL.sub("(filing agent)", text).split())


def authority_event_key(row: AuthorityHistory) -> str | None:
    """The timeline key of the event an authority action belongs to; None when undated."""
    if row.action_date is None:
        return None
    category = authority_rule(row.action)[0]
    docket = f"{row.docket_prefix.value}{row.docket_number}"
    return f"authority:{docket}:{category}:{row.action_date.isoformat()}"


def authority_events(history: Iterable[AuthorityHistory]) -> list[TimelineEventValues]:
    """One event per authority action; the same action reported by both systems (same docket,
    category and date) becomes one event."""
    events: dict[str, TimelineEventValues] = {}
    for row in sorted(history, key=lambda r: (r.source_system != "MOTUS", r.id)):
        if row.action_date is None:
            continue
        docket = f"{row.docket_prefix.value}{row.docket_number}"
        category, severity, title = authority_rule(row.action)
        key = f"authority:{docket}:{category}:{row.action_date.isoformat()}"  # authority_event_key
        if key in events:
            continue
        detail = _safe(row.reason) or _safe(row.action) or ""
        parts = [f"{docket}: {detail.capitalize().rstrip('.')}." if detail else f"{docket}."]
        if row.authority_type:
            parts.append(f"Authority type: {row.authority_type.capitalize()}.")
        if row.status:
            parts.append(f"Status afterwards: {row.status.capitalize()}.")
        parts.append(f"Source: FMCSA {'Motus' if row.source_system == 'MOTUS' else 'L&I'}.")
        events[key] = TimelineEventValues(
            event_key=key,
            event_type=f"{AUTHORITY_PREFIX}{category}",
            event_date=row.action_date,
            severity=severity,
            title=f"{title} ({docket})",
            description=" ".join(parts),
            raw_record_id=row.raw_record_id,
        )
    return list(events.values())


# --- insurance ---------------------------------------------------------------------------

_TYPE_LABEL = {"BIPD": "BI&PD", "CARGO": "Cargo", "BOND": "Surety bond", "TRUST_FUND": "Trust fund"}


def _insurer_key(name: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (name or "").upper())


def _money(amount: Decimal | None) -> str:
    return f"${amount:,.0f}" if amount is not None else "unknown"


def _end(filing: Insurance) -> date | None:
    """Last covered day: cancellation date, or for a filing that left the current list, the
    day we last saw it. Open-ended (None) while on file."""
    if filing.on_file:
        return None
    if filing.termination_date:
        return filing.termination_date
    return filing.updated_at.date() if filing.updated_at else None


def insurance_events(
    filings: Sequence[Insurance], authorities: Sequence[Authority], today: date
) -> list[TimelineEventValues]:
    by_docket_type: dict[tuple[str, str], list[Insurance]] = defaultdict(list)
    for f in filings:
        if f.docket_prefix and f.docket_number and f.insurance_type and f.effective_date:
            by_docket_type[(f"{f.docket_prefix.value}{f.docket_number}", f.insurance_type)].append(
                f
            )
    active_dockets = {
        f"{a.docket_prefix.value}{a.docket_number}" for a in authorities if is_active_authority(a)
    }

    events: list[TimelineEventValues] = []
    for (docket, kind), group in sorted(by_docket_type.items()):
        group.sort(key=lambda f: (f.effective_date, f.id or 0))
        label = _TYPE_LABEL.get(kind, kind.title())
        events += _insurer_and_coverage_changes(docket, kind, label, group)
        events += _cancellations(docket, kind, label, group)
        events += _gaps(docket, kind, label, group, docket in active_dockets, today)
    return events


def _insurer_and_coverage_changes(
    docket: str, kind: str, label: str, group: Sequence[Insurance]
) -> list[TimelineEventValues]:
    events = []
    # One entry per distinct filing start, so the same policy listed twice isn't a "change".
    previous: Insurance | None = None
    for f in group:
        if previous is not None and f.effective_date != previous.effective_date:
            day = f.effective_date
            assert day is not None
            if (
                _insurer_key(f.insurer) != _insurer_key(previous.insurer)
                and f.insurer
                and previous.insurer
            ):
                events.append(
                    TimelineEventValues(
                        event_key=f"insurance:{docket}:{kind}:INSURER_CHANGED:{day.isoformat()}",
                        event_type=f"{INSURANCE_PREFIX}INSURER_CHANGED",
                        event_date=day,
                        severity=Severity.INFO,
                        title=f"{label} insurer changed ({docket})",
                        description=(
                            f"{label} filing with {f.insurer} effective {day.isoformat()}, "
                            f"after {previous.insurer}. A change of insurer is common and is not "
                            "a concern on its own."
                        ),
                        raw_record_id=f.raw_record_id,
                    )
                )
            if (
                kind == "BIPD"
                and f.coverage_amount is not None
                and previous.coverage_amount is not None
                and f.coverage_amount != previous.coverage_amount
            ):
                lower = f.coverage_amount < previous.coverage_amount
                direction = "decreased" if lower else "increased"
                events.append(
                    TimelineEventValues(
                        event_key=f"insurance:{docket}:{kind}:COVERAGE_CHANGED:{day.isoformat()}",
                        event_type=f"{INSURANCE_PREFIX}COVERAGE_CHANGED",
                        event_date=day,
                        severity=Severity.LOW if lower else Severity.INFO,
                        title=f"{label} coverage {direction} ({docket})",
                        description=(
                            f"{label} coverage on file changed from "
                            f"{_money(previous.coverage_amount)} to {_money(f.coverage_amount)}."
                        ),
                        raw_record_id=f.raw_record_id,
                    )
                )
        previous = f
    return events


def _covered(group: Sequence[Insurance], day: date, exclude: Insurance) -> bool:
    for f in group:
        if f is exclude or f.effective_date is None or f.effective_date > day:
            continue
        end = _end(f)
        if end is None or end >= day:
            return True
    return False


def _cancellations(
    docket: str, kind: str, label: str, group: Sequence[Insurance]
) -> list[TimelineEventValues]:
    events = []
    for f in group:
        if f.status != "CANCELLED" or f.termination_date is None:
            continue
        day = f.termination_date
        replaced = _covered(group, day + timedelta(days=1), exclude=f)
        events.append(
            TimelineEventValues(
                event_key=f"insurance:{docket}:{kind}:CANCELLED:{day.isoformat()}:{_insurer_key(f.policy_number)}",
                event_type=f"{INSURANCE_PREFIX}CANCELLED",
                event_date=day,
                severity=Severity.INFO if replaced else Severity.MEDIUM,
                title=f"{label} policy cancelled ({docket})",
                description=(
                    f"{label} policy {f.policy_number or '(no number)'} with "
                    f"{f.insurer or 'an unknown insurer'} cancelled effective {day.isoformat()}. "
                    + (
                        "Another filing of this type was on file the next day."
                        if replaced
                        else "No other filing of this type was on file the next day."
                    )
                ),
                raw_record_id=f.raw_record_id,
            )
        )
    return events


def _gaps(
    docket: str,
    kind: str,
    label: str,
    group: Sequence[Insurance],
    authority_active: bool,
    today: date,
) -> list[TimelineEventValues]:
    """Periods with no filing of this type on file, between the first filing and today."""
    severity = Severity.MEDIUM if kind == "BIPD" else Severity.LOW
    spans = sorted(
        ((f.effective_date, _end(f), f) for f in group if f.effective_date is not None),
        key=lambda span: (span[0], span[1] or date.max),  # never compare the records themselves
    )
    events = []
    covered_until: date | None = None  # None while an open-ended filing is on file
    last: Insurance | None = None
    open_ended = False
    for start, end, f in spans:
        if (
            not open_ended
            and covered_until is not None
            and start > covered_until + timedelta(days=1)
        ):
            gap_start = covered_until + timedelta(days=1)
            days = (start - gap_start).days
            gap_end = (start - timedelta(days=1)).isoformat()
            plural = "s" if days != 1 else ""
            events.append(
                TimelineEventValues(
                    event_key=f"insurance:{docket}:{kind}:GAP:{gap_start.isoformat()}",
                    event_type=f"{INSURANCE_PREFIX}GAP",
                    event_date=gap_start,
                    severity=severity,
                    title=f"Gap in {label} filings ({docket})",
                    description=(
                        f"No {label} filing on file from {gap_start.isoformat()} to "
                        f"{gap_end} ({days} day{plural}), "
                        "based on available FMCSA records."
                    ),
                    raw_record_id=f.raw_record_id,
                )
            )
        if end is None:
            open_ended = True
        elif not open_ended and (covered_until is None or end > covered_until):
            covered_until = end
        last = f
    if (
        not open_ended
        and covered_until is not None
        and covered_until < today
        and authority_active
        and kind == "BIPD"
    ):
        since = covered_until + timedelta(days=1)
        events.append(
            TimelineEventValues(
                event_key=f"insurance:{docket}:{kind}:NONE_ON_FILE:{since.isoformat()}",
                event_type=f"{INSURANCE_PREFIX}NONE_ON_FILE",
                event_date=since,
                severity=Severity.MEDIUM,
                title=f"No {label} filing on file ({docket})",
                description=(
                    f"The authority is active but no {label} filing has been on file since "
                    f"{since.isoformat()}, based on available FMCSA records. Requires review."
                ),
                raw_record_id=last.raw_record_id if last else None,
            )
        )
    return events
