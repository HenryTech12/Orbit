from datetime import datetime, timedelta

from app.services.reminders import schedule_reminder, get_due_reminders
from app.models import ZoomDetection


def test_detect_endpoint_with_link_and_time(client):
    resp = client.post("/zoom/detect", json={
        "message": "Let's meet tomorrow at 7pm https://zoom.us/j/1234567890",
        "reference_time": "2026-09-17T10:00:00",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["zoom_url"]
    assert body["zoom_meeting_id"] == "1234567890"
    assert body["detected_datetime"] is not None


def test_detect_endpoint_without_link_rejected(client):
    resp = client.post("/zoom/detect", json={"message": "no link here at all"})
    assert resp.status_code == 422


def test_detect_endpoint_with_link_but_no_time(client):
    resp = client.post("/zoom/detect", json={
        "message": "Standing link https://zoom.us/j/999 for whenever",
    })
    assert resp.status_code == 201
    assert resp.json()["detected_datetime"] is None


def test_list_detections(client):
    client.post("/zoom/detect", json={
        "message": "Call today at 9am https://zoom.us/j/1",
        "reference_time": "2026-09-17T08:00:00",
    })
    client.post("/zoom/detect", json={
        "message": "Call today at 10am https://zoom.us/j/2",
        "reference_time": "2026-09-17T08:00:00",
    })

    resp = client.get("/zoom/detections")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_reminder_scheduled_at_correct_offset(db_session):
    detection = ZoomDetection(
        raw_message="msg",
        zoom_url="https://zoom.us/j/1",
        detected_datetime=datetime(2026, 9, 18, 19, 0, 0),
    )
    db_session.add(detection)
    db_session.commit()
    db_session.refresh(detection)

    job = schedule_reminder(db_session, detection)
    assert job is not None
    assert job.remind_at == datetime(2026, 9, 18, 18, 30, 0)  # 30 min lead, from config default
    assert job.sent is False


def test_reminder_not_scheduled_without_detected_datetime(db_session):
    detection = ZoomDetection(raw_message="msg", zoom_url="https://zoom.us/j/1", detected_datetime=None)
    db_session.add(detection)
    db_session.commit()
    db_session.refresh(detection)

    job = schedule_reminder(db_session, detection)
    assert job is None


def test_due_reminders_filters_correctly(db_session):
    detection = ZoomDetection(raw_message="msg", zoom_url="https://zoom.us/j/1", detected_datetime=datetime(2026, 9, 18, 19, 0, 0))
    db_session.add(detection)
    db_session.commit()
    db_session.refresh(detection)

    job = schedule_reminder(db_session, detection)  # remind_at = 18:30

    not_yet_due = get_due_reminders(db_session, now=datetime(2026, 9, 18, 18, 0, 0))
    assert job.id not in [j.id for j in not_yet_due]

    now_due = get_due_reminders(db_session, now=datetime(2026, 9, 18, 18, 30, 0))
    assert job.id in [j.id for j in now_due]


def test_reminders_due_endpoint_and_mark_sent(client):
    detect_resp = client.post("/zoom/detect", json={
        "message": "Call today at 09:05 https://zoom.us/j/1",
        "reference_time": "2026-09-17T08:00:00",
    })
    assert detect_resp.status_code == 201

    # remind_at will be 08:35 (09:05 minus the 30 minute default lead),
    # which is already in the past relative to "now" for this test.
    due_resp = client.get("/zoom/reminders/due")
    assert due_resp.status_code == 200
    due_list = due_resp.json()
    assert len(due_list) == 1
    assert due_list[0]["sent"] is False

    mark_resp = client.post(f"/zoom/reminders/{due_list[0]['id']}/sent")
    assert mark_resp.status_code == 200
    assert mark_resp.json()["sent"] is True

    # Once marked sent, it should no longer show up as due.
    due_resp_after = client.get("/zoom/reminders/due")
    assert due_resp_after.json() == []


def test_mark_sent_nonexistent_reminder(client):
    resp = client.post("/zoom/reminders/does-not-exist/sent")
    assert resp.status_code == 404


def test_webhook_creates_and_processes_meeting_automatically(client):
    resp = client.post("/zoom/webhook", json={
        "zoom_meeting_id": "1234567890",
        "topic": "Hackathon Planning",
        "start_time": "2026-09-18T19:00:00",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Hackathon Planning"
    assert body["platform"] == "zoom"
    assert body["status"] == "completed"
    assert body["recording_url"]  # came from the stub Zoom client
    assert len(body["chunks"]) >= 1  # transcribed, chunked, and embedded automatically


def test_webhook_links_back_to_originating_detection(client):
    detect_resp = client.post("/zoom/detect", json={
        "message": "Call tomorrow at 7pm https://zoom.us/j/1234567890",
        "reference_time": "2026-09-17T08:00:00",
    })
    detection_id = detect_resp.json()["id"]

    webhook_resp = client.post("/zoom/webhook", json={
        "zoom_meeting_id": "1234567890",
        "detection_id": detection_id,
    })
    assert webhook_resp.status_code == 201
    meeting_id = webhook_resp.json()["id"]

    detections = client.get("/zoom/detections").json()
    matching = next(d for d in detections if d["id"] == detection_id)
    assert matching["meeting_id"] == meeting_id


def test_webhook_with_unknown_detection_id_returns_404(client):
    resp = client.post("/zoom/webhook", json={
        "zoom_meeting_id": "1234567890",
        "detection_id": "does-not-exist",
    })
    assert resp.status_code == 404
