from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Meeting, MeetingPlatform, ZoomDetection
from app.schemas import (
    ZoomDetectRequest, ZoomDetectionOut, ReminderOut, ZoomWebhookPayload, MeetingOut,
)
from app.services.zoom_detection import detect_zoom_meeting
from app.services.zoom_client import get_zoom_client
from app.services.meeting_pipeline import process_meeting
from app.services.reminders import schedule_reminder, get_due_reminders, mark_sent

router = APIRouter(prefix="/zoom", tags=["zoom"])


@router.post("/detect", response_model=ZoomDetectionOut, status_code=201)
def detect(payload: ZoomDetectRequest, db: Session = Depends(get_db)):
    """Scan a raw chat message for a Zoom link + meeting time. If both a
    link and a time are found, a reminder is scheduled automatically
    (PRD: "detects a Zoom meeting link -> reminds members")."""
    result = detect_zoom_meeting(payload.message, payload.reference_time)

    if not result.zoom_url:
        raise HTTPException(status_code=422, detail="No Zoom link found in the message.")

    detection = ZoomDetection(
        raw_message=payload.message,
        zoom_url=result.zoom_url,
        zoom_meeting_id=result.zoom_meeting_id,
        detected_datetime=result.detected_datetime,
        title_guess=result.title_guess,
    )
    db.add(detection)
    db.commit()
    db.refresh(detection)

    if detection.detected_datetime is not None:
        job = schedule_reminder(db, detection)
        if job is not None:
            detection.reminder_sent = False  # reminder is scheduled, not yet sent
            db.commit()
            db.refresh(detection)

    return detection


@router.get("/detections", response_model=list[ZoomDetectionOut])
def list_detections(db: Session = Depends(get_db)):
    return db.query(ZoomDetection).order_by(ZoomDetection.created_at.desc()).all()


@router.get("/reminders/due", response_model=list[ReminderOut])
def reminders_due(db: Session = Depends(get_db)):
    """Polled by whatever actually sends the reminder into the group
    (Nanri's in-group component, PRD 6.8) to find reminders whose time
    has arrived."""
    return get_due_reminders(db)


@router.post("/reminders/{reminder_id}/sent", response_model=ReminderOut)
def mark_reminder_sent(reminder_id: str, db: Session = Depends(get_db)):
    from app.models import ReminderJob

    job = db.get(ReminderJob, reminder_id)
    if not job:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return mark_sent(db, job)


@router.post("/webhook", response_model=MeetingOut, status_code=201)
def zoom_webhook(payload: ZoomWebhookPayload, db: Session = Depends(get_db)):
    """Simulates Zoom's `recording.completed` webhook: fetches the
    recording, creates a Meeting, and runs it through the full
    transcribe -> chunk -> embed -> store pipeline automatically, with
    no manual admin step (PRD: "receives/processes the recording
    automatically")."""
    detection = None
    if payload.detection_id:
        detection = db.get(ZoomDetection, payload.detection_id)
        if not detection:
            raise HTTPException(status_code=404, detail="Zoom detection not found")

    client = get_zoom_client()
    recording = client.get_recording(payload.zoom_meeting_id)

    meeting = Meeting(
        title=payload.topic or recording.topic,
        platform=MeetingPlatform.zoom,
        scheduled_time=payload.start_time,
        recording_url=payload.download_url or recording.download_url,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    if detection is not None:
        detection.meeting_id = meeting.id
        db.commit()

    return process_meeting(db, meeting)
