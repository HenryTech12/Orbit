"""
Trust-status computation and "what changed between X and Y" narrative
generation over the topic_history table (PRD Sections 6.1 and 6.3 -
Henry's ownership).
"""
from datetime import datetime, timedelta
from typing import List

from app.config import settings
from app.models import TopicHistoryEntry, TopicStatus

_AUTHORITY_RANK = {"official": 1, "general": 0}


def compute_topic_status(history: List[TopicHistoryEntry], now: datetime = None) -> TopicStatus:
    """
    Precedence, matching the PRD's trust-layer definitions:

    1. No history at all              -> unknown
    2. More than one distinct value   -> disputed  (content conflict beats staleness)
    3. Single/consistent value, old   -> stale
    4. Single/consistent value, fresh -> confirmed
    """
    if not history:
        return TopicStatus.unknown

    now = now or datetime.utcnow()

    distinct_values = {entry.value_snapshot.strip().lower() for entry in history}
    if len(distinct_values) > 1:
        return TopicStatus.disputed

    latest = max(history, key=lambda e: e.timestamp)
    age = now - latest.timestamp
    if age > timedelta(days=settings.STALE_AFTER_DAYS):
        return TopicStatus.stale

    return TopicStatus.confirmed


def current_entry(history: List[TopicHistoryEntry]) -> TopicHistoryEntry:
    """The entry that should be treated as "current": official sources
    outrank general discussion (PRD 6.2 source-authority ranking); among
    entries of equal authority, the most recent wins."""
    return sorted(
        history,
        key=lambda e: (_AUTHORITY_RANK.get(e.authority_level, 0), e.timestamp),
        reverse=True,
    )[0]


def build_change_narrative(history: List[TopicHistoryEntry]) -> str:
    """Human-readable timeline for the "what changed between X and Y"
    demo scenario (PRD Section 8, Scenario 8)."""
    if not history:
        return "No information has been recorded on this topic yet."

    ordered = sorted(history, key=lambda e: e.timestamp)

    if len(ordered) == 1:
        entry = ordered[0]
        return (
            f"On {entry.timestamp.strftime('%a %d %b')}: "
            f"\"{entry.value_snapshot}\" ({entry.authority_level} source)."
        )

    lines = []
    for i, entry in enumerate(ordered):
        label = "First" if i == 0 else ("Later" if i < len(ordered) - 1 else "Most recent")
        lines.append(
            f"{label} ({entry.timestamp.strftime('%a %d %b')}): "
            f"\"{entry.value_snapshot}\" ({entry.authority_level} source)"
        )

    current = current_entry(ordered)
    lines.append(f"Current: \"{current.value_snapshot}\"")
    return " | ".join(lines)
