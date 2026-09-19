import enum
import json
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, DateTime, Boolean, ForeignKey, Text, Enum, Integer
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id() -> str:
    return str(uuid.uuid4())


class MeetingStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class MeetingPlatform(str, enum.Enum):
    zoom = "zoom"
    google_meet = "google_meet"
    other = "other"


class TopicStatus(str, enum.Enum):
    confirmed = "confirmed"
    disputed = "disputed"
    stale = "stale"
    unknown = "unknown"


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, default=gen_id)
    title = Column(String, nullable=False)
    platform = Column(Enum(MeetingPlatform), default=MeetingPlatform.other)
    scheduled_time = Column(DateTime, nullable=True)
    recording_url = Column(String, nullable=True)
    transcript_text = Column(Text, nullable=True)
    status = Column(Enum(MeetingStatus), default=MeetingStatus.pending)
    created_at = Column(DateTime, default=datetime.utcnow)

    chunks = relationship("TranscriptChunk", back_populates="meeting", cascade="all, delete-orphan")


class TranscriptChunk(Base):
    __tablename__ = "transcript_chunks"

    id = Column(String, primary_key=True, default=gen_id)
    meeting_id = Column(String, ForeignKey("meetings.id"), nullable=False)
    text = Column(Text, nullable=False)
    # Stored as a JSON-encoded list of floats for SQLite portability.
    # On Postgres+pgvector deployments, PgVectorStore (see
    # services/vector_store.py) writes/reads embeddings via raw SQL
    # against a proper `vector` column instead (see sql/init_pgvector.sql).
    embedding_json = Column(Text, nullable=False)
    start_time = Column(String, nullable=True)
    end_time = Column(String, nullable=True)
    speaker = Column(String, nullable=True)

    meeting = relationship("Meeting", back_populates="chunks")

    @property
    def embedding(self):
        return json.loads(self.embedding_json)

    @embedding.setter
    def embedding(self, value):
        self.embedding_json = json.dumps(value)


class Topic(Base):
    __tablename__ = "topics"

    id = Column(String, primary_key=True, default=gen_id)
    label = Column(String, nullable=False, unique=True)
    latest_status = Column(Enum(TopicStatus), default=TopicStatus.unknown)
    last_updated = Column(DateTime, default=datetime.utcnow)

    history = relationship(
        "TopicHistoryEntry", back_populates="topic",
        cascade="all, delete-orphan", order_by="TopicHistoryEntry.timestamp",
    )


class TopicHistoryEntry(Base):
    __tablename__ = "topic_history"

    id = Column(String, primary_key=True, default=gen_id)
    topic_id = Column(String, ForeignKey("topics.id"), nullable=False)
    source_type = Column(String, nullable=False)  # whatsapp | meeting_transcript | pdf
    source_id = Column(String, nullable=True)
    value_snapshot = Column(Text, nullable=False)
    authority_level = Column(String, default="general")  # official | general
    timestamp = Column(DateTime, default=datetime.utcnow)

    topic = relationship("Topic", back_populates="history")


class ZoomDetection(Base):
    __tablename__ = "zoom_detections"

    id = Column(String, primary_key=True, default=gen_id)
    raw_message = Column(Text, nullable=False)
    zoom_url = Column(String, nullable=True)
    zoom_meeting_id = Column(String, nullable=True)
    detected_datetime = Column(DateTime, nullable=True)
    title_guess = Column(String, nullable=True)
    reminder_sent = Column(Boolean, default=False)
    meeting_id = Column(String, ForeignKey("meetings.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ReminderJob(Base):
    __tablename__ = "reminder_jobs"

    id = Column(String, primary_key=True, default=gen_id)
    detection_id = Column(String, ForeignKey("zoom_detections.id"), nullable=False)
    remind_at = Column(DateTime, nullable=False)
    sent = Column(Boolean, default=False)
