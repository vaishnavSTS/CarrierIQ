"""Is an event potentially eligible for a DataQs review, by timing alone? (docs/DataQ.md, Phase 2)

Government baseline [S1]: states review inspection requests within 3 years of the inspection and
crash requests within 5 years. This says nothing about whether the record is wrong, and outside the
window the answer is "manual assessment", never "the government cannot consider it".

Conventions (documented, as the spec requires):
- The window ends on the event date's anniversary N years later, by calendar date, never
  N * 365 days. An event on February 29 has its anniversary on February 28 when the later year has
  no February 29.
- The anniversary day itself, a February 29 event, an unknown event date and a date in the future
  are boundary cases: a person on the STS team confirms them (STAFF_REVIEW).
- STS asks for requests an internal cutoff earlier than the government window
  (DATAQS_INTERNAL_CUTOFF_DAYS). Past that cutoff the case still goes ahead, with staff review.
  The cutoff is an STS target, not a government rule.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

from app.models.enums import DataQsEventType

POLICY_VERSION = "2026-10-21"
WINDOW_YEARS = {DataQsEventType.INSPECTION: 3, DataQsEventType.CRASH: 5}

EligibilityStatus = Literal["POTENTIALLY_ELIGIBLE", "STAFF_REVIEW", "MANUAL_ASSESSMENT"]


@dataclass(frozen=True)
class Eligibility:
    status: EligibilityStatus
    window_years: int
    window_ends: date | None  # the anniversary: last day of the review window
    internal_cutoff: date | None
    days_left: int | None  # until window_ends; negative once it has passed
    notes: list[str] = field(default_factory=list)
    policy_version: str = POLICY_VERSION


def anniversary(event: date, years: int) -> date:
    """The same calendar date `years` later; February 29 falls back to February 28."""
    try:
        return event.replace(year=event.year + years)
    except ValueError:  # February 29 in a year without one
        return event.replace(year=event.year + years, day=28)


def assess(
    event_date: date | None,
    event_type: DataQsEventType,
    today: date,
    internal_cutoff_days: int,
) -> Eligibility:
    years = WINDOW_YEARS[event_type]
    if event_date is None:
        return Eligibility(
            "STAFF_REVIEW",
            years,
            None,
            None,
            None,
            ["The event date is unknown, so STS will confirm the review window."],
        )
    if event_date > today:
        return Eligibility(
            "STAFF_REVIEW",
            years,
            None,
            None,
            None,
            ["The event date is in the future, which suggests a data error; STS will check it."],
        )

    ends = anniversary(event_date, years)
    cutoff = ends - timedelta(days=internal_cutoff_days)
    days_left = (ends - today).days
    notes: list[str] = []
    leap_day = event_date.month == 2 and event_date.day == 29
    if leap_day:
        notes.append(
            "The event was on February 29, so STS will confirm exactly when the window ends."
        )

    if today > ends:
        notes.append(
            f"This is more than {years} years after the event, past the usual state review "
            "window. STS can still assess it manually."
        )
        return Eligibility("MANUAL_ASSESSMENT", years, ends, cutoff, days_left, notes)
    if today == ends:
        notes.append("Today is the last day of the review window; STS will confirm it in time.")
        return Eligibility("STAFF_REVIEW", years, ends, cutoff, days_left, notes)
    if today > cutoff:
        notes.append(
            f"Only {days_left} day{'' if days_left == 1 else 's'} left in the review window; "
            "STS will review it urgently."
        )
        return Eligibility("STAFF_REVIEW", years, ends, cutoff, days_left, notes)
    status: EligibilityStatus = "STAFF_REVIEW" if leap_day else "POTENTIALLY_ELIGIBLE"
    return Eligibility(status, years, ends, cutoff, days_left, notes)
