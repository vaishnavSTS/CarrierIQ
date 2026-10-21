"""DataQs deadline arithmetic (services/dataqs_clock_service.py): pauses, overlaps, due dates."""

from datetime import UTC, datetime, timedelta

from app.services.dataqs_clock_service import due, merged, paused_for, used

START = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)


def day(n: float) -> datetime:
    return START + timedelta(days=n)


def test_the_specs_example_leaves_13_days_not_a_fresh_21() -> None:
    """8 days used, the agency asks for information, the answer comes 5 days later."""
    pauses = [(day(8), day(13))]
    assert used(START, pauses, day(13)) == timedelta(days=8)
    assert timedelta(days=21) - used(START, pauses, day(13)) == timedelta(days=13)
    assert due(START, 21, pauses) == day(26)  # 21 days of review + 5 days paused


def test_while_paused_no_time_is_used_and_there_is_no_due_date() -> None:
    pauses = [(day(8), None)]
    assert used(START, pauses, day(12)) == timedelta(days=8)
    assert due(START, 21, pauses) is None


def test_overlapping_pauses_count_once() -> None:
    pauses = [(day(2), day(6)), (day(4), day(9)), (day(12), day(13))]
    assert merged(pauses, day(30)) == [(day(2), day(9)), (day(12), day(13))]
    assert paused_for(pauses, START, day(30)) == timedelta(days=8)
    assert due(START, 21, pauses) == day(29)


def test_a_pause_before_the_stage_started_does_not_count() -> None:
    pauses = [(day(-3), day(2))]
    assert paused_for(pauses, START, day(10)) == timedelta(days=2)


def test_no_pauses_means_the_plain_budget() -> None:
    assert due(START, 45, []) == day(45)
    assert used(START, [], day(10)) == timedelta(days=10)
