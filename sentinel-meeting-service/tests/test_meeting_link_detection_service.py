from datetime import datetime

from app.services.meeting_link_detection import detect_meeting_link


REFERENCE = datetime(2026, 9, 17, 10, 0, 0)  # a Thursday


# ---------- Zoom ----------

def test_detects_zoom_link_and_id():
    msg = "Join here: https://zoom.us/j/1234567890?pwd=abc123"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.platform == "zoom"
    assert result.meeting_url is not None
    assert result.platform_meeting_id == "1234567890"


def test_zoom_title_guess_default():
    msg = "https://zoom.us/j/555 tomorrow at 8am"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.title_guess == "Zoom Meeting"


# ---------- Microsoft Teams (the real UniPods platform) ----------

def test_detects_teams_link():
    msg = "Join the Wadhwani session: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123 today at 3pm"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.platform == "teams"
    assert result.meeting_url is not None
    assert result.detected_datetime.hour == 15


def test_detects_teams_short_meet_link():
    msg = "https://teams.microsoft.com/meet/419860837373470 tomorrow at 7pm"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.platform == "teams"
    assert "teams.microsoft.com" in result.meeting_url


def test_extracts_teams_meeting_id_quoted_in_text():
    msg = (
        "Session started again; meeting ID 419 860 837 373 470, passcode g2Z7gc7Q "
        "https://teams.microsoft.com/l/meetup-join/19%3ameeting_xyz today 3pm"
    )
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.platform == "teams"
    assert result.platform_meeting_id == "419860837373470"


def test_teams_title_guess_default():
    msg = "https://teams.microsoft.com/meet/12345 tomorrow at 8am"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.title_guess == "Teams Meeting"


def test_teams_title_guess_from_keyword():
    msg = "Join the orientation session https://teams.microsoft.com/meet/12345 tomorrow 8am"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.title_guess == "Orientation Meeting"


# ---------- Neither platform / shared logic ----------

def test_no_link_returns_unknown_platform():
    result = detect_meeting_link("let's meet tomorrow at 7pm", reference_time=REFERENCE)
    assert result.platform == "unknown"
    assert result.meeting_url is None


def test_resolves_tomorrow_correctly():
    msg = "Guys let's move the meeting to tomorrow 7pm https://zoom.us/j/111"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.detected_datetime is not None
    assert result.detected_datetime.date() == datetime(2026, 9, 18).date()
    assert result.detected_datetime.hour == 19


def test_resolves_today_correctly():
    msg = "Standup today at 9am https://zoom.us/j/222"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.detected_datetime.date() == REFERENCE.date()
    assert result.detected_datetime.hour == 9


def test_no_time_information_returns_none_datetime():
    msg = "Here's the recurring link https://zoom.us/j/333 use it whenever"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.detected_datetime is None


def test_title_guess_from_keyword():
    msg = "Let's do a quick standup https://zoom.us/j/444 tomorrow at 8am"
    result = detect_meeting_link(msg, reference_time=REFERENCE)
    assert result.title_guess == "Standup Meeting"
