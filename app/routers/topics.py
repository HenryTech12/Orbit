from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Topic, TopicHistoryEntry
from app.schemas import TopicCreate, TopicOut, TopicHistoryCreate, TopicChangesOut
from app.services.contradiction import compute_topic_status, build_change_narrative

router = APIRouter(prefix="/topics", tags=["topics"])


@router.post("/", response_model=TopicOut, status_code=201)
def create_topic(payload: TopicCreate, db: Session = Depends(get_db)):
    existing = db.query(Topic).filter(Topic.label == payload.label).first()
    if existing:
        raise HTTPException(status_code=409, detail="Topic with this label already exists")

    topic = Topic(label=payload.label)
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.get("/", response_model=list[TopicOut])
def list_topics(db: Session = Depends(get_db)):
    return db.query(Topic).all()


@router.get("/{topic_id}", response_model=TopicOut)
def get_topic(topic_id: str, db: Session = Depends(get_db)):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return topic


@router.post("/{topic_id}/history", response_model=TopicOut)
def add_history(topic_id: str, payload: TopicHistoryCreate, db: Session = Depends(get_db)):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    entry = TopicHistoryEntry(
        topic_id=topic.id,
        source_type=payload.source_type,
        source_id=payload.source_id,
        value_snapshot=payload.value_snapshot,
        authority_level=payload.authority_level,
        timestamp=payload.timestamp or datetime.utcnow(),
    )
    db.add(entry)
    db.commit()

    db.refresh(topic)
    topic.latest_status = compute_topic_status(topic.history)
    topic.last_updated = entry.timestamp
    db.commit()
    db.refresh(topic)
    return topic


@router.get("/{topic_id}/changes", response_model=TopicChangesOut)
def get_changes(topic_id: str, db: Session = Depends(get_db)):
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Status is recomputed on read too (not just on write) so a topic
    # that has simply gone quiet correctly flips to "stale" over time,
    # not only when a new event happens to touch it.
    topic.latest_status = compute_topic_status(topic.history)
    db.commit()
    db.refresh(topic)

    narrative = build_change_narrative(topic.history)
    return TopicChangesOut(topic=topic, history=topic.history, narrative=narrative)
