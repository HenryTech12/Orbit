from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Meeting, MeetingPlatform
from app.schemas import MeetingCreate, MeetingOut
from app.services.meeting_pipeline import process_meeting

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.post("/", response_model=MeetingOut, status_code=201)
def create_meeting(payload: MeetingCreate, db: Session = Depends(get_db)):
    try:
        platform = MeetingPlatform(payload.platform)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Unknown platform '{payload.platform}'")

    if not payload.recording_url and not payload.transcript_text:
        raise HTTPException(
            status_code=422,
            detail="Provide either recording_url (to be transcribed) or transcript_text directly.",
        )

    meeting = Meeting(
        title=payload.title,
        platform=platform,
        scheduled_time=payload.scheduled_time,
        recording_url=payload.recording_url,
        transcript_text=payload.transcript_text,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


@router.get("/", response_model=list[MeetingOut])
def list_meetings(db: Session = Depends(get_db)):
    return db.query(Meeting).order_by(Meeting.created_at.desc()).all()


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("/{meeting_id}/process", response_model=MeetingOut)
def process(meeting_id: str, db: Session = Depends(get_db)):
    """Run the transcribe -> chunk -> embed -> store pipeline for a
    meeting that was created with a recording_url and/or is ready to be
    (re)processed."""
    meeting = db.get(Meeting, meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    try:
        return process_meeting(db, meeting)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
