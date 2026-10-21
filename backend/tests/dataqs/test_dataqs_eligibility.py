"""Review-window timing (services/dataqs_eligibility.py) and evidence file checks."""

from datetime import date

import pytest

from app.models.enums import DataQsEventType
from app.services.dataqs_eligibility import anniversary, assess
from app.services.dataqs_evidence_service import clean_file_name, sniff_type

INSPECTION = DataQsEventType.INSPECTION
CUTOFF = 30


def test_anniversary_is_by_calendar_date_not_365_day_years() -> None:
    assert anniversary(date(2024, 3, 1), 3) == date(2027, 3, 1)  # 1096 days, not 1095
    assert anniversary(date(2024, 2, 29), 3) == date(2027, 2, 28)
    assert anniversary(date(2024, 2, 29), 4) == date(2028, 2, 29)


def test_recent_inspection_is_potentially_eligible() -> None:
    result = assess(date(2025, 6, 1), INSPECTION, date(2026, 10, 21), CUTOFF)
    assert result.status == "POTENTIALLY_ELIGIBLE"
    assert result.window_years == 3
    assert result.window_ends == date(2028, 6, 1)
    assert result.internal_cutoff == date(2028, 5, 2)
    assert result.notes == []


def test_past_the_internal_cutoff_goes_to_staff_review() -> None:
    result = assess(date(2023, 11, 1), INSPECTION, date(2026, 10, 21), CUTOFF)
    assert result.status == "STAFF_REVIEW"
    assert result.days_left == 11


def test_the_anniversary_day_itself_is_a_staff_review_item() -> None:
    result = assess(date(2023, 10, 21), INSPECTION, date(2026, 10, 21), CUTOFF)
    assert (result.status, result.days_left) == ("STAFF_REVIEW", 0)


def test_after_the_window_is_manual_assessment_not_refused() -> None:
    result = assess(date(2023, 10, 20), INSPECTION, date(2026, 10, 21), CUTOFF)
    assert result.status == "MANUAL_ASSESSMENT"
    assert result.days_left == -1
    assert "can still assess it manually" in result.notes[0]


def test_crashes_have_a_five_year_window() -> None:
    result = assess(date(2022, 10, 21), DataQsEventType.CRASH, date(2026, 10, 21), CUTOFF)
    assert (result.status, result.window_ends) == ("POTENTIALLY_ELIGIBLE", date(2027, 10, 21))


@pytest.mark.parametrize("event", [None, date(2026, 12, 1), date(2024, 2, 29)])
def test_unknown_future_and_leap_day_dates_go_to_staff_review(event: date | None) -> None:
    assert assess(event, INSPECTION, date(2026, 10, 21), CUTOFF).status == "STAFF_REVIEW"


@pytest.mark.parametrize(
    ("data", "name", "expected"),
    [
        (b"%PDF-1.7 ...", "report.pdf", "application/pdf"),
        (b"\xff\xd8\xff\xe0 jpeg", "photo.jpg", "image/jpeg"),
        (b"\x89PNG\r\n\x1a\n....", "scan.png", "image/png"),
        (b"\x00\x00\x00\x18ftypmp42....", "dashcam.mp4", "video/mp4"),
        (b"date,hours\n2026-10-01,10\n", "eld.txt", "text/plain"),
        (b"date,hours\n", "eld.csv", None),  # DataQs doesn't take CSV
        (b"GIF89a....", "photo.gif", "image/gif"),
        (b"II*\x00....", "scan.tif", "image/tiff"),
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1..", "log.xls", "application/vnd.ms-excel"),
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1..", "log.exe", None),
        (
            b"PK\x03\x04....word/document.xml",
            "letter.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        (b"PK\x03\x04....anything", "archive.zip", None),  # refused until uploads are scanned
        (b"PK\x03\x04", "records.docx", None),  # a ZIP that isn't a Word file
        (b"\x30\x26\xb2\x75\x8e\x66\xcf\x11....", "dashcam.wmv", "video/x-ms-wmv"),
        (b"MZ\x90\x00", "report.pdf", None),  # an executable named .pdf
    ],
)
def test_file_type_comes_from_the_content(data: bytes, name: str, expected: str | None) -> None:
    assert sniff_type(data, name) == expected


def test_file_names_lose_folders_and_control_characters() -> None:
    assert clean_file_name("C:\\Users\\me\\report.pdf") == "report.pdf"
    assert clean_file_name("../../etc/passwd\x00.pdf") == "passwd.pdf"
    assert clean_file_name("") == "evidence"
