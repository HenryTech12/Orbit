from datetime import datetime, timedelta

from app.models import TopicHistoryEntry
from app.services.contradiction import compute_topic_status, build_change_narrative, current_entry
from app.models import TopicStatus


def make_entry(value, authority="general", days_ago=0):
    return TopicHistoryEntry(
        source_type="whatsapp",
        value_snapshot=value,
        authority_level=authority,
        timestamp=datetime.utcnow() - timedelta(days=days_ago),
    )


def test_no_history_is_unknown():
    assert compute_topic_status([]) == TopicStatus.unknown


def test_single_recent_entry_is_confirmed():
    entries = [make_entry("Deadline is Friday", days_ago=0)]
    assert compute_topic_status(entries) == TopicStatus.confirmed


def test_single_old_entry_is_stale():
    entries = [make_entry("Deadline is Friday", days_ago=10)]
    assert compute_topic_status(entries) == TopicStatus.stale


def test_repeated_identical_value_stays_confirmed():
    entries = [
        make_entry("Deadline is Friday", days_ago=2),
        make_entry("Deadline is Friday", days_ago=0),
    ]
    assert compute_topic_status(entries) == TopicStatus.confirmed


def test_conflicting_values_are_disputed_even_if_recent():
    entries = [
        make_entry("Deadline is Friday", days_ago=1),
        make_entry("Deadline is Monday", days_ago=0),
    ]
    assert compute_topic_status(entries) == TopicStatus.disputed


def test_disputed_takes_priority_over_stale():
    entries = [
        make_entry("Deadline is Friday", days_ago=20),
        make_entry("Deadline is Monday", days_ago=15),
    ]
    assert compute_topic_status(entries) == TopicStatus.disputed


def test_current_entry_prefers_official_over_more_recent_general():
    official = make_entry("Official: Friday", authority="official", days_ago=3)
    general = make_entry("Rumor: Thursday", authority="general", days_ago=0)
    assert current_entry([official, general]) is official


def test_current_entry_falls_back_to_recency_when_authority_ties():
    older = make_entry("Old value", authority="general", days_ago=3)
    newer = make_entry("New value", authority="general", days_ago=0)
    assert current_entry([older, newer]) is newer


def test_narrative_single_entry():
    entries = [make_entry("Only statement", days_ago=1)]
    narrative = build_change_narrative(entries)
    assert "Only statement" in narrative


def test_narrative_empty():
    assert "No information" in build_change_narrative([])


def test_narrative_multi_entry_includes_first_and_current():
    entries = [
        make_entry("First value", days_ago=5),
        make_entry("Middle value", days_ago=3),
        make_entry("Latest value", days_ago=0),
    ]
    narrative = build_change_narrative(entries)
    assert "First value" in narrative
    assert "Latest value" in narrative
    assert "Current:" in narrative
