from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Meeting, MeetingPlatform, MeetingDetection, ReminderJob
from app.schemas import (
    MeetingDetectRequest, MeetingDetectionOut, ReminderOut, MeetingWebhookPayload, MeetingOut,
)
from app.services.meeting_link_detection import detect_meeting_link
from app.services.recording_clients import get_recording_client
from app.services.meeting_pipeline import process_meeting
from app.services.reminders import schedule_reminder, get_due_reminders, mark_sent

router = APIRouter(prefix="/meeting-links", tags=["meeting-links"])

_PLATFORM_MAP = {
    "zoom": MeetingPlatform.zoom,
    "teams": MeetingPlatform.teams,
}


@router.post("/detect", response_model=MeetingDetectionOut, status_code=201)
def detect(payload: MeetingDetectRequest, db: Session = Depends(get_db)):
    """Scan a raw chat message for a Zoom or Microsoft Teams link plus a
    meeting time. If both a link and a time are found, a reminder is
    scheduled automatically (PRD: "detects a meeting link -> reminds
    members")."""
    result = detect_meeting_link(payload.message, payload.reference_time)

    if result.platform == "unknown" or not result.meeting_url:
        raise HTTPException(status_code=422, detail="No Zoom or Teams link found in the message.")

    detection = MeetingDetection(
        raw_message=payload.message,
        platform=result.platform,
        meeting_url=result.meeting_url,
        platform_meeting_id=result.platform_meeting_id,
        detected_datetime=result.detected_datetime,
        title_guess=result.title_guess,
    )
    db.add(detection)
    db.commit()
    db.refresh(detection)

    if detection.detected_datetime is not None:
        schedule_reminder(db, detection)

    return detection


@router.get("/detections", response_model=list[MeetingDetectionOut])
def list_detections(db: Session = Depends(get_db)):
    return db.query(MeetingDetection).order_by(MeetingDetection.created_at.desc()).all()


@router.get("/reminders/due", response_model=list[ReminderOut])
def reminders_due(db: Session = Depends(get_db)):
    """Polled by whatever actually sends the reminder into the group
    (Nanri's in-group component, PRD 6.8) to find reminders whose time
    has arrived."""
    return get_due_reminders(db)


@router.post("/reminders/{reminder_id}/sent", response_model=ReminderOut)
def mark_reminder_sent(reminder_id: str, db: Session = Depends(get_db)):
    job = db.get(ReminderJob, reminder_id)
    if not job:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return mark_sent(db, job)


@router.post("/webhook", response_model=MeetingOut, status_code=201)
def recording_webhook(payload: MeetingWebhookPayload, db: Session = Depends(get_db)):
    """Simulates a recording-ready notification (Zoom's
    `recording.completed` webhook, or the Microsoft Graph equivalent for
    Teams): fetches the recording and runs it through the full
    transcribe -> chunk -> embed -> store pipeline automatically, with
    no manual admin step (PRD: "receives/processes the recording
    automatically")."""
    if payload.platform not in _PLATFORM_MAP:
        raise HTTPException(status_code=422, detail=f"Unsupported platform '{payload.platform}'. Use 'zoom' or 'teams'.")

    detection = None
    if payload.detection_id:
        detection = db.get(MeetingDetection, payload.detection_id)
        if not detection:
            raise HTTPException(status_code=404, detail="Meeting detection not found")

    client = get_recording_client(payload.platform)
    recording = client.get_recording(payload.platform_meeting_id)

    meeting = Meeting(
        title=payload.topic or recording.topic,
        platform=_PLATFORM_MAP[payload.platform],
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
