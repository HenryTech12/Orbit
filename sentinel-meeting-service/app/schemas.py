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


# ---------- Meeting link detection (Zoom / Teams) ----------

class MeetingDetectRequest(BaseModel):
    message: str
    reference_time: Optional[datetime] = None  # lets callers/tests pin "now"


class MeetingDetectionOut(BaseModel):
    id: str
    raw_message: str
    platform: str  # zoom | teams | unknown
    meeting_url: Optional[str] = None
    platform_meeting_id: Optional[str] = None
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


class MeetingWebhookPayload(BaseModel):
    """Generalized recording-ready webhook payload, covering both Zoom's
    real `recording.completed` event and the equivalent Microsoft Graph
    notification for Teams."""
    platform: str  # "zoom" | "teams"
    platform_meeting_id: str
    detection_id: Optional[str] = None
    topic: Optional[str] = "Meeting"
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
