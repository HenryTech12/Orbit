"""
Detect a Zoom meeting link (and, heuristically, its date/time) inside a
raw chat message (PRD: "Sentinel detects a Zoom meeting link -> reminds
members -> ... -> processes the recording/transcript automatically",
reassigned to Henry).
"""
import re
from datetime import datetime, timedelta
from typing import NamedTuple, Optional

from dateutil import parser as dateparser

_ZOOM_URL_RE = re.compile(
    r"https?://[\w.-]*zoom\.us/(?:j|my)/[\w?=&/-]+", re.IGNORECASE
)
_ZOOM_MEETING_ID_RE = re.compile(r"/j/(\d+)")


class ZoomDetectionResult(NamedTuple):
    zoom_url: Optional[str]
    zoom_meeting_id: Optional[str]
    detected_datetime: Optional[datetime]
    title_guess: Optional[str]


def detect_zoom_meeting(message: str, reference_time: datetime = None) -> ZoomDetectionResult:
    reference_time = reference_time or datetime.utcnow()

    url_match = _ZOOM_URL_RE.search(message)
    zoom_url = url_match.group(0) if url_match else None

    zoom_meeting_id = None
    if zoom_url:
        id_match = _ZOOM_MEETING_ID_RE.search(zoom_url)
        zoom_meeting_id = id_match.group(1) if id_match else None

    detected_dt = _extract_datetime(message, reference_time)
    title_guess = _guess_title(message)

    return ZoomDetectionResult(
        zoom_url=zoom_url,
        zoom_meeting_id=zoom_meeting_id,
        detected_datetime=detected_dt,
        title_guess=title_guess,
    )


def _extract_datetime(message: str, reference_time: datetime) -> Optional[datetime]:
    # Strip the URL first so the parser isn't confused by digits in it.
    text_without_url = _ZOOM_URL_RE.sub("", message)
    lowered = text_without_url.lower()

    # dateutil has no built-in concept of "today"/"tomorrow" (unlike bare
    # weekday names, which it does resolve correctly on its own) - so
    # those need to be resolved to an actual base date ourselves before
    # handing the rest of the string to dateutil for time-of-day parsing.
    base_date = None
    if "tomorrow" in lowered:
        base_date = (reference_time + timedelta(days=1)).date()
    elif "today" in lowered or "tonight" in lowered:
        base_date = reference_time.date()

    default_dt = (
        datetime.combine(base_date, reference_time.time())
        if base_date is not None
        else reference_time
    )

    try:
        result = dateparser.parse(text_without_url, fuzzy=True, default=default_dt)
    except (ValueError, OverflowError):
        return None

    # dateutil's fuzzy parse silently falls back to `default` when it
    # finds no date/time tokens at all. Only trust the result if the
    # message actually contained something date/time-ish - a weekday
    # name, an explicit clock time, or one of the relative words handled
    # above - otherwise we'd wrongly claim "the meeting is right now".
    time_tokens = re.search(
        r"\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\btoday\b|\btomorrow\b|\btonight\b|\bmonday\b|"
        r"\btuesday\b|\bwednesday\b|\bthursday\b|\bfriday\b|\bsaturday\b|\bsunday\b",
        message, re.IGNORECASE,
    )
    if not time_tokens:
        return None
    return result


def _guess_title(message: str) -> str:
    lowered = message.lower()
    for keyword in ("planning", "review", "standup", "kickoff", "retro", "sync"):
        if keyword in lowered:
            return f"{keyword.capitalize()} Meeting"
    return "Zoom Meeting"
