from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


# ---------- Meetings ----------

class MeetingCreate(BaseModel):
    title: str
    platform: str = "other"  # zoom | google_meet | other
    scheduled_time: Optional[datetime] = None
    recording_url: Optional[str] = None
    transcript_text: Optional[str] = None


class ChunkOut(BaseModel):
    id: str
    text: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    speaker: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MeetingOut(BaseModel):
    id: str
    title: str
    platform: str
    scheduled_time: Optional[datetime] = None
    recording_url: Optional[str] = None
    transcript_text: Optional[str] = None
    status: str
    created_at: datetime
    chunks: List[ChunkOut] = []

    model_config = ConfigDict(from_attributes=True)


# ---------- Topics ----------

class TopicCreate(BaseModel):
    label: str


class TopicHistoryCreate(BaseModel):
    source_type: str  # whatsapp | meeting_transcript | pdf
    source_id: Optional[str] = None
    value_snapshot: str
    authority_level: str = "general"  # official | general
    timestamp: Optional[datetime] = None


class TopicHistoryOut(BaseModel):
    id: str
    source_type: str
    source_id: Optional[str] = None
    value_snapshot: str
    authority_level: str
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class TopicOut(BaseModel):
    id: str
    label: str
    latest_status: str
    last_updated: datetime

    model_config = ConfigDict(from_attributes=True)


class TopicChangesOut(BaseModel):
    topic: TopicOut
    history: List[TopicHistoryOut]
    narrative: str


# ---------- Zoom ----------

class ZoomDetectRequest(BaseModel):
    message: str
    reference_time: Optional[datetime] = None  # "now", for resolving relative dates in tests


class ZoomDetectionOut(BaseModel):
    id: str
    raw_message: str
    zoom_url: Optional[str] = None
    zoom_meeting_id: Optional[str] = None
    detected_datetime: Optional[datetime] = None
    title_guess: Optional[str] = None
    reminder_sent: bool
    meeting_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ReminderOut(BaseModel):
    id: str
    detection_id: str
    remind_at: datetime
    sent: bool

    model_config = ConfigDict(from_attributes=True)


class ZoomWebhookPayload(BaseModel):
    """Mirrors the fields Zoom's real `recording.completed` webhook sends,
    trimmed to what this service actually needs."""
    zoom_meeting_id: str
    detection_id: Optional[str] = None
    topic: Optional[str] = "Zoom Meeting"
    download_url: Optional[str] = None
    start_time: Optional[datetime] = None


# ---------- Vector search ----------

class VectorSearchRequest(BaseModel):
    query: str
    top_k: int = 5


class VectorSearchResult(BaseModel):
    chunk_id: str
    meeting_id: str
    text: str
    score: float


class VectorSearchResponse(BaseModel):
    results: List[VectorSearchResult]
