"""The Safety Score Report's inspection history: FMCSA's SMS violations grouped by inspection,
newest first and heaviest violation first, with the report number, state and plate from the
inspection when it is on file."""

from datetime import date
from decimal import Decimal

from app.models import Inspection, SmsViolation
from app.services.carrier_safety_service import sms_inspection_history


def violation(inspection_id: str, when: date, code: str, total: str, oos: bool = False):
    return SmsViolation(
        carrier_id=1,
        inspection_id=inspection_id,
        inspection_date=when,
        code=code,
        basic="HOS Compliance",
        group=None,
        description=f"Violation {code}",
        unit="D",
        out_of_service=oos,
        severity_weight=7,
        time_weight=3,
        total_weight=Decimal(total),
    )


def test_violations_grouped_by_inspection_newest_and_heaviest_first() -> None:
    old, new = date(2025, 3, 11), date(2026, 3, 12)
    rows = [
        violation("A", old, "392.2-SLLS2", "4"),
        violation("B", new, "395.24C2II-ELDTN", "3"),
        violation("B", new, "395.8E-HOSPDOOS", "27", oos=True),
    ]
    found = Inspection(
        inspection_id="B",
        report_number="NET349000952",
        carrier_id=1,
        inspection_date=new,
        inspection_level=3,
        state="NE",
        plate="ZP59859",
        plate_state="CA",
        vin="1XPBDP9X1KD123456",
        vehicle_oos=False,
        driver_oos=True,
    )
    history = sms_inspection_history(rows, [found])
    assert history is not None
    assert [i.inspection_id for i in history] == ["B", "A"]
    newest = history[0]
    assert (newest.report_number, newest.state, newest.plate, newest.driver_oos) == (
        "NET349000952",
        "NE",
        "ZP59859",
        True,
    )
    assert [v.code for v in newest.violations] == ["395.8E-HOSPDOOS", "395.24C2II-ELDTN"]
    assert newest.violations[0].out_of_service and newest.violations[0].total_weight == 27
    assert newest.vin == "1XPBDP9X1KD123456" and newest.violations[0].unit == "D"
    # An inspection that isn't on file still shows, without the report details.
    assert history[1].report_number is None and history[1].violations[0].code == "392.2-SLLS2"


def test_not_fetched_is_none_and_nothing_is_empty() -> None:
    assert sms_inspection_history(None, []) is None
    assert sms_inspection_history([], []) == []


def test_matched_by_date_when_the_ids_differ() -> None:
    """FMCSA's SMS file and inspection file use different ids for the same inspection."""
    when = date(2026, 3, 12)
    rows = [violation("785721681", when, "395.8E-HOSPDOOS", "27", oos=True)]
    on_file = Inspection(
        inspection_id="87302409",
        report_number="T349000952",
        carrier_id=1,
        inspection_date=when,
        state="NE",
        vehicle_oos=False,
        driver_oos=True,
    )
    [found] = sms_inspection_history(rows, [on_file]) or []
    assert (found.report_number, found.state) == ("T349000952", "NE")

    # Two inspections that day: no guess.
    twin = Inspection(
        inspection_id="87302410",
        carrier_id=1,
        inspection_date=when,
        state="IA",
        vehicle_oos=False,
        driver_oos=False,
    )
    [unmatched] = sms_inspection_history(rows, [on_file, twin]) or []
    assert unmatched.report_number is None
