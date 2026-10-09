"""What drives a carrier's CSA (SMS) measures, from FMCSA's SMS input violations. Pure functions.

FMCSA weighs each violation by severity (1-10, plus 2 when it put a unit out of service) and by
age (x3 in the last 6 months, x2 for 6-12 months, x1 for 12-24 months). The file carries those
weights; this only adds them up by BASIC and violation group.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from app.schemas.carrier_safety import BasicDriverOut, ViolationGroupOut

TOP_GROUPS = 5
EXAMPLES = 2
RECENT_DAYS = 182  # FMCSA's highest time weight: the last 6 months


@dataclass(frozen=True)
class ViolationValues:
    inspection_id: str
    inspection_date: date
    code: str
    basic: str
    group: str | None
    description: str | None
    unit: str | None
    out_of_service: bool
    severity_weight: int
    time_weight: int
    total_weight: Decimal


def _date(value: object) -> date | None:
    text = str(value or "").strip()
    for fmt in ("%d-%b-%y", "%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:10] if fmt == "%Y-%m-%d" else text, fmt).date()
        except ValueError:
            continue
    return None


def _int(value: object) -> int:
    try:
        return int(float(str(value)))
    except ValueError:
        return 0


def parse_violations(rows: Sequence[dict[str, Any]]) -> list[ViolationValues]:
    found = []
    for row in rows:
        when = _date(row.get("insp_date"))
        basic = str(row.get("basic_desc") or "").strip()
        if when is None or not basic:
            continue
        try:
            total = Decimal(str(row.get("total_severity_wght") or "0"))
        except ArithmeticError:
            total = Decimal(0)
        found.append(
            ViolationValues(
                inspection_id=str(row.get("unique_id") or "")[:30],
                inspection_date=when,
                code=str(row.get("viol_code") or "")[:30],
                basic=basic[:60],
                group=(str(row["group_desc"])[:100] if row.get("group_desc") else None),
                description=(str(row["section_desc"])[:300] if row.get("section_desc") else None),
                unit=(str(row["viol_unit"])[:5] if row.get("viol_unit") else None),
                out_of_service=str(row.get("oos_indicator") or "").lower() in ("true", "y"),
                severity_weight=_int(row.get("severity_weight")),
                time_weight=_int(row.get("time_weight")),
                total_weight=total,
            )
        )
    return found


def basic_drivers(violations: Sequence[Any], today: date) -> list[BasicDriverOut]:
    """Per BASIC, heaviest first: totals and the violation groups that weigh most. Accepts
    ViolationValues or SmsViolation rows (same attribute names)."""
    by_basic: dict[str, list[Any]] = defaultdict(list)
    for v in violations:
        by_basic[v.basic].append(v)
    recent_from = today - timedelta(days=RECENT_DAYS)
    out = []
    for basic, rows in by_basic.items():
        total = float(sum(Decimal(v.total_weight) for v in rows))
        groups: dict[str, list[Any]] = defaultdict(list)
        for v in rows:
            groups[v.group or "Other"].append(v)
        group_out = []
        for name, members in groups.items():
            weight = float(sum(Decimal(v.total_weight) for v in members))
            heaviest: dict[str, float] = defaultdict(float)
            for v in members:
                if v.description:
                    heaviest[v.description] += float(v.total_weight)
            group_out.append(
                ViolationGroupOut(
                    group=name,
                    violations=len(members),
                    out_of_service=sum(1 for v in members if v.out_of_service),
                    weight=round(weight, 2),
                    share=round(weight / total, 4) if total else 0.0,
                    examples=[
                        d for d, _ in sorted(heaviest.items(), key=lambda kv: -kv[1])[:EXAMPLES]
                    ],
                )
            )
        group_out.sort(key=lambda g: (-g.weight, g.group))
        out.append(
            BasicDriverOut(
                basic=basic,
                violations=len(rows),
                out_of_service=sum(1 for v in rows if v.out_of_service),
                weight=round(total, 2),
                recent_violations=sum(1 for v in rows if v.inspection_date >= recent_from),
                groups=group_out[:TOP_GROUPS],
            )
        )
    out.sort(key=lambda b: (-b.weight, b.basic))
    return out
