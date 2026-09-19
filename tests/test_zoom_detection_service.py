from datetime import datetime

from app.services.zoom_detection import detect_zoom_meeting


REFERENCE = datetime(2026, 9, 17, 10, 0, 0)  # a Thursday


def test_detects_zoom_link_and_id():
    msg = "Join here: https://zoom.us/j/1234567890?pwd=abc123"
    result = detect_zoom_meeting(msg, reference_time=REFERENCE)
    assert result.zoom_url is not None
    assert result.zoom_meeting_id == "1234567890"


def test_no_zoom_link_returns_none():
    result = detect_zoom_meeting("let's meet tomorrow at 7pm", reference_time=REFERENCE)
    assert result.zoom_url is None


def test_resolves_tomorrow_correctly():
    msg = "Guys let's move the meeting to tomorrow 7pm https://zoom.us/j/111"
    result = detect_zoom_meeting(msg, reference_time=REFERENCE)
    assert result.detected_datetime is not None
    assert result.detected_datetime.date() == datetime(2026, 9, 18).date()
    assert result.detected_datetime.hour == 19


def test_resolves_today_correctly():
    msg = "Standup today at 9am https://zoom.us/j/222"
    result = detect_zoom_meeting(msg, reference_time=REFERENCE)
    assert result.detected_datetime.date() == REFERENCE.date()
    assert result.detected_datetime.hour == 9


def test_no_time_information_returns_none_datetime():
    msg = "Here's the recurring link https://zoom.us/j/333 use it whenever"
    result = detect_zoom_meeting(msg, reference_time=REFERENCE)
    assert result.detected_datetime is None


def test_title_guess_from_keyword():
    msg = "Let's do a quick standup https://zoom.us/j/444 tomorrow at 8am"
    result = detect_zoom_meeting(msg, reference_time=REFERENCE)
    assert result.title_guess == "Standup Meeting"


def test_title_guess_default():
    msg = "https://zoom.us/j/555 tomorrow at 8am"
    result = detect_zoom_meeting(msg, reference_time=REFERENCE)
    assert result.title_guess == "Zoom Meeting"
