"""Safety trend signals (requires TEST_DATABASE_URL)."""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.intelligence.base_rule import RuleContext, SignalValues
from app.intelligence.rules.safety_trend import SafetyTrendRule
from app.models import Carrier, Inspection
from app.models.enums import Confidence, Severity
from tests.factories import make_carrier, make_raw_record

TODAY = date(2026, 10, 8)


def inspect(
    db: Session,
    carrier: Carrier,
    days_ago: int,
    n: int,
    vehicle_oos: int,
    level: int | None = None,
) -> None:
    """`n` inspections `days_ago` days before TODAY, the first `vehicle_oos` of them OOS."""
    for k in range(n):
        inspection_id = f"{carrier.usdot_number}-{days_ago}-{k}-{level}"
        db.add(
            Inspection(
                carrier_id=carrier.id,
                inspection_id=inspection_id,
                inspection_date=TODAY - timedelta(days=days_ago),
                state="WA",
                inspection_level=level,
                vehicle_oos=k < vehicle_oos,
                driver_oos=False,
                source="dot_socrata",
                raw_record_id=make_raw_record(db, external_id=inspection_id).id,
            )
        )
    db.flush()


def evaluate(db: Session, carrier: Carrier) -> dict[str, SignalValues]:
    found = SafetyTrendRule().evaluate(RuleContext(db, carrier, TODAY))
    return {s.signal_key: s for s in found}


def test_vehicle_oos_rate_rose(db: Session) -> None:
    carrier = make_carrier(db)
    inspect(db, carrier, days_ago=500, n=10, vehicle_oos=1)  # earlier year: 10%
    inspect(db, carrier, days_ago=30, n=10, vehicle_oos=4)  # last 12 months: 40%

    found = evaluate(db, carrier)

    rose = found["safety_trend:vehicle_oos_rose"]
    assert (rose.severity, rose.confidence) == (Severity.MEDIUM, Confidence.MEDIUM)  # +30 points
    assert "40% over the last 12 months (4 of 10" in rose.description
    assert "up from 10%" in rose.description
    assert "no industry benchmark" in rose.description
    types = [e.evidence_type for e in rose.evidence]
    assert types == ["COMPARISON", "COMPARISON", "THRESHOLD"] + ["RECORD"] * 4
    assert all(e.raw_record_id for e in rose.evidence if e.evidence_type == "RECORD")
    assert "safety_trend:driver_oos_rose" not in found


def test_driver_only_inspections_do_not_dilute_the_vehicle_rate(db: Session) -> None:
    carrier = make_carrier(db)
    inspect(db, carrier, days_ago=500, n=10, vehicle_oos=1, level=1)  # 10%
    inspect(db, carrier, days_ago=30, n=5, vehicle_oos=4, level=2)  # 80% of vehicle inspections
    inspect(db, carrier, days_ago=30, n=20, vehicle_oos=0, level=3)  # driver only: not counted

    rose = evaluate(db, carrier)["safety_trend:vehicle_oos_rose"]

    assert "80% over the last 12 months (4 of 5 inspections that examined the vehicle)" in (
        rose.description
    )


def test_small_or_steady_changes_are_not_signals(db: Session) -> None:
    carrier = make_carrier(db)
    inspect(db, carrier, days_ago=500, n=10, vehicle_oos=2)  # 20%
    inspect(db, carrier, days_ago=30, n=10, vehicle_oos=3)  # 30%: +10 points but 1.5x

    assert "safety_trend:vehicle_oos_rose" in evaluate(db, carrier)  # exactly at the threshold

    other = make_carrier(db, usdot_number=7654321)
    inspect(db, other, days_ago=500, n=10, vehicle_oos=3)
    inspect(db, other, days_ago=30, n=10, vehicle_oos=4)  # 30% -> 40%: under 1.5x
    assert evaluate(db, other) == {}


def test_too_few_inspections(db: Session) -> None:
    carrier = make_carrier(db)
    inspect(db, carrier, days_ago=500, n=4, vehicle_oos=0)
    inspect(db, carrier, days_ago=30, n=4, vehicle_oos=4)

    assert evaluate(db, carrier) == {}


def test_inspections_stopped(db: Session) -> None:
    carrier = make_carrier(db)
    inspect(db, carrier, days_ago=400, n=6, vehicle_oos=0)

    (stopped,) = evaluate(db, carrier).values()

    assert stopped.signal_key == "safety_trend:inspections_stopped"
    assert stopped.severity == Severity.LOW
    assert "does not show either on its own" in stopped.description
