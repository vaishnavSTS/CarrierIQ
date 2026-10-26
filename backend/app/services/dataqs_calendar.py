"""Calendar entries for a booked call: an .ics file (Outlook, Apple Calendar, Google) and an
"Add to Google Calendar" link. Neither is an invitation: METHOD:PUBLISH has no organizer or
attendees, so the person adds it to their own calendar. The .ics carries a reminder 30 minutes
before; the Google link can't (Google applies the person's default reminders)."""

from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from app.models import DataQsCall, DataQsCase

REMINDER_MINUTES = 30
PRODID = "-//Sky Transport Solutions//CarrierSafetyScan DataQs//EN"


def _utc(at: datetime) -> str:
    return at.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _escape(text: str) -> str:
    """RFC 5545 TEXT: backslash, semicolon and comma escaped; newlines as \\n."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\n")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    """Lines longer than 75 octets are folded (CRLF and a space), as RFC 5545 requires."""
    data = line.encode("utf-8")
    if len(data) <= 75:
        return line
    parts: list[str] = []
    start = 0
    while start < len(data):
        end = min(start + (75 if not parts else 74), len(data))
        while end < len(data) and (data[end] & 0xC0) == 0x80:  # don't split a character
            end -= 1
        parts.append(data[start:end].decode("utf-8"))
        start = end
    return "\r\n ".join(parts)


def call_title(case: DataQsCase) -> str:
    return f"Call with STS about DataQs case {case.id}"


def call_details(call: DataQsCall, case: DataQsCase, link: str) -> str:
    lines = [
        f"Your STS specialist calls you at {call.phone} about DataQs case {case.id} "
        f"(inspection {case.source_event_id}).",
    ]
    if call.topic:
        lines.append(f"Topic: {call.topic}")
    lines.append(f"Open the case: {link}")
    lines.append("To move or cancel the call, use the case page.")
    return "\n".join(lines)


def ics(call: DataQsCall, case: DataQsCase, link: str, *, cancelled: bool = False) -> bytes:
    """The call as an .ics file. A move keeps the UID and raises SEQUENCE, so calendar apps
    replace the earlier entry; a cancellation marks it CANCELLED."""
    ends = call.starts_at + timedelta(minutes=call.duration_minutes)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        f"METHOD:{'CANCEL' if cancelled else 'PUBLISH'}",
        "BEGIN:VEVENT",
        f"UID:dataqs-call-{call.id}@carriersafetyscan",
        f"SEQUENCE:{call.sequence}",
        f"DTSTAMP:{_utc(datetime.now(UTC))}",
        f"DTSTART:{_utc(call.starts_at)}",
        f"DTEND:{_utc(ends)}",
        f"SUMMARY:{_escape(call_title(case))}",
        f"DESCRIPTION:{_escape(call_details(call, case, link))}",
        f"LOCATION:{_escape(f'Phone call to {call.phone}')}",
        f"URL:{link}",
        f"STATUS:{'CANCELLED' if cancelled else 'CONFIRMED'}",
        "TRANSP:OPAQUE",
    ]
    if not cancelled:
        lines += [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_escape(call_title(case))}",
            f"TRIGGER:-PT{REMINDER_MINUTES}M",
            "END:VALARM",
        ]
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return ("\r\n".join(_fold(line) for line in lines) + "\r\n").encode("utf-8")


def google_link(call: DataQsCall, case: DataQsCase, link: str) -> str:
    """Google Calendar's "create event" page, filled in; the person saves it to their calendar."""
    ends = call.starts_at + timedelta(minutes=call.duration_minutes)
    query = urlencode(
        {
            "action": "TEMPLATE",
            "text": call_title(case),
            "dates": f"{_utc(call.starts_at)}/{_utc(ends)}",
            "details": call_details(call, case, link),
            "location": f"Phone call to {call.phone}",
            "ctz": call.time_zone,
        }
    )
    return f"https://calendar.google.com/calendar/render?{query}"


def when(call: DataQsCall) -> str:
    """e.g. "Tue, Oct 27 at 2:30 PM CDT", in the booker's time zone."""
    local = call.starts_at.astimezone(ZoneInfo(call.time_zone))
    hour = local.hour % 12 or 12
    return (
        f"{local.strftime('%a, %b')} {local.day} at {hour}:{local.minute:02d} "
        f"{'AM' if local.hour < 12 else 'PM'} {local.tzname()}"
    )
