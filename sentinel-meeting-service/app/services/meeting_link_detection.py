"""
Detect a meeting link (Zoom or Microsoft Teams) and, heuristically, its
date/time, inside a raw chat message (PRD: "Sentinel detects a meeting
link -> reminds members -> ... -> processes the recording/transcript
automatically", reassigned to Henry).

Originally built for Zoom only. Generalized after discovering (via a
live test of the deployed bot against the real UniPods community) that
the actual community uses Microsoft Teams links, not Zoom - so both are
detected here, with a `platform` field telling the caller which one.
"""
import re
from datetime import datetime, timedelta
from typing import NamedTuple, Optional

from dateutil import parser as dateparser

_ZOOM_URL_RE = re.compile(
    r"https?://[\w.-]*zoom\.us/(?:j|my)/[\w?=&/-]+", re.IGNORECASE
)
_ZOOM_MEETING_ID_RE = re.compile(r"/j/(\d+)")

# Real Teams meeting links look like:
#   https://teams.microsoft.com/l/meetup-join/19%3ameeting_.../0?context=...
# or the shorter
#   https://teams.microsoft.com/meet/419860837373470...
_TEAMS_URL_RE = re.compile(
    r"https?://teams\.microsoft\.com/[\w%./?=&-]+", re.IGNORECASE
)
# The numeric "meeting ID" some Teams messages quote separately in text
# (e.g. "meeting ID 419 860 837 373 470"), distinct from the URL itself.
_TEAMS_MEETING_ID_TEXT_RE = re.compile(
    r"meeting\s*id\s*[:\-]?\s*([\d\s]{9,})", re.IGNORECASE
)


class MeetingDetectionResult(NamedTuple):
    platform: str  # "zoom" | "teams" | "unknown"
    meeting_url: Optional[str]
    platform_meeting_id: Optional[str]
    detected_datetime: Optional[datetime]
    title_guess: Optional[str]


def detect_meeting_link(message: str, reference_time: datetime = None) -> MeetingDetectionResult:
    reference_time = reference_time or datetime.utcnow()

    platform, meeting_url, platform_meeting_id = _detect_platform_and_id(message)
    detected_dt = _extract_datetime(message, reference_time, meeting_url)
    title_guess = _guess_title(message, platform)

    return MeetingDetectionResult(
        platform=platform,
        meeting_url=meeting_url,
        platform_meeting_id=platform_meeting_id,
        detected_datetime=detected_dt,
        title_guess=title_guess,
    )


def _detect_platform_and_id(message: str):
    zoom_match = _ZOOM_URL_RE.search(message)
    if zoom_match:
        zoom_url = zoom_match.group(0)
        id_match = _ZOOM_MEETING_ID_RE.search(zoom_url)
        return "zoom", zoom_url, (id_match.group(1) if id_match else None)

    teams_match = _TEAMS_URL_RE.search(message)
    if teams_match:
        teams_url = teams_match.group(0)
        id_match = _TEAMS_MEETING_ID_TEXT_RE.search(message)
        platform_meeting_id = id_match.group(1).replace(" ", "") if id_match else None
        return "teams", teams_url, platform_meeting_id

    return "unknown", None, None


def _extract_datetime(message: str, reference_time: datetime, meeting_url: Optional[str]) -> Optional[datetime]:
    text_without_url = message
    if meeting_url:
        text_without_url = message.replace(meeting_url, "")
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


def _guess_title(message: str, platform: str) -> str:
    lowered = message.lower()
    for keyword in ("planning", "review", "standup", "kickoff", "retro", "sync", "orientation", "welcome", "session"):
        if keyword in lowered:
            return f"{keyword.capitalize()} Meeting"
    if platform == "teams":
        return "Teams Meeting"
    if platform == "zoom":
        return "Zoom Meeting"
    return "Meeting"
