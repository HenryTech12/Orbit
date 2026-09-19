"""
The actual "recording -> structured knowledge" pipeline (PRD Section 6,
meeting recording/transcript pipeline - Henry's ownership). Shared by
the manual /meetings/{id}/transcribe endpoint and the automatic Zoom
webhook flow, so both paths behave identically.
"""
from sqlalchemy.orm import Session

from app.models import Meeting, MeetingStatus, TranscriptChunk
from app.services.embeddings import chunk_text, get_embedding_backend
from app.services.transcription import get_transcription_backend


def process_meeting(db: Session, meeting: Meeting) -> Meeting:
    """Transcribe (if needed), chunk, embed, and store a meeting's
    content. Safe to call on a meeting that already has transcript_text
    (e.g. supplied directly rather than via a recording)."""
    meeting.status = MeetingStatus.processing
    db.commit()

    try:
        if not meeting.transcript_text:
            if not meeting.recording_url:
                raise ValueError("Meeting has neither a transcript nor a recording URL to transcribe.")
            backend = get_transcription_backend()
            meeting.transcript_text = backend.transcribe(meeting.recording_url)
            db.commit()

        embedder = get_embedding_backend()
        for piece in chunk_text(meeting.transcript_text):
            chunk = TranscriptChunk(meeting_id=meeting.id, text=piece)
            chunk.embedding = embedder.embed(piece)
            db.add(chunk)

        meeting.status = MeetingStatus.completed
        db.commit()
        db.refresh(meeting)
        return meeting

    except Exception:
        meeting.status = MeetingStatus.failed
        db.commit()
        raise
