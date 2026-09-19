"""
Reminder scheduling for detected Zoom meetings (PRD: "reminds members").

There's no real WhatsApp send integration in this service (that lives
in Nanri's in-group component, PRD Section 6.8) - this module owns the
scheduling/due-tracking side: computing when a reminder is due and
exposing which ones are due now. A poller (or, in production, a Celery
beat task) calls `get_due_reminders` and hands them off to whatever
actually sends the message.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import ReminderJob, ZoomDetection


def schedule_reminder(db: Session, detection: ZoomDetection) -> Optional[ReminderJob]:
    if detection.detected_datetime is None:
        return None

    remind_at = detection.detected_datetime - timedelta(minutes=settings.REMINDER_LEAD_MINUTES)
    job = ReminderJob(detection_id=detection.id, remind_at=remind_at, sent=False)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_due_reminders(db: Session, now: datetime = None) -> List[ReminderJob]:
    now = now or datetime.utcnow()
    return (
        db.query(ReminderJob)
        .filter(ReminderJob.sent.is_(False), ReminderJob.remind_at <= now)
        .all()
    )


def mark_sent(db: Session, job: ReminderJob) -> ReminderJob:
    job.sent = True
    db.commit()
    db.refresh(job)
    return job
