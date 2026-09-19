from datetime import datetime, timedelta


def test_create_topic(client):
    resp = client.post("/topics/", json={"label": "Submission Format"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["label"] == "Submission Format"
    assert body["latest_status"] == "unknown"  # no history yet


def test_create_duplicate_topic_rejected(client):
    client.post("/topics/", json={"label": "Deadline"})
    resp = client.post("/topics/", json={"label": "Deadline"})
    assert resp.status_code == 409


def test_get_topic_not_found(client):
    resp = client.get("/topics/does-not-exist")
    assert resp.status_code == 404


def test_single_history_entry_is_confirmed(client):
    topic = client.post("/topics/", json={"label": "Deployment"}).json()

    resp = client.post(f"/topics/{topic['id']}/history", json={
        "source_type": "whatsapp",
        "value_snapshot": "We're deploying on Friday.",
        "authority_level": "general",
    })
    assert resp.status_code == 200
    assert resp.json()["latest_status"] == "confirmed"


def test_conflicting_history_entries_are_disputed(client):
    topic = client.post("/topics/", json={"label": "Deadline"}).json()

    client.post(f"/topics/{topic['id']}/history", json={
        "source_type": "whatsapp",
        "value_snapshot": "Deadline is Wednesday.",
        "authority_level": "general",
        "timestamp": (datetime.utcnow() - timedelta(days=2)).isoformat(),
    })
    resp = client.post(f"/topics/{topic['id']}/history", json={
        "source_type": "whatsapp",
        "value_snapshot": "Deadline moved to Friday.",
        "authority_level": "official",
        "timestamp": datetime.utcnow().isoformat(),
    })

    assert resp.status_code == 200
    assert resp.json()["latest_status"] == "disputed"


def test_old_consistent_history_is_stale(client):
    topic = client.post("/topics/", json={"label": "Old Announcement"}).json()

    old_timestamp = (datetime.utcnow() - timedelta(days=30)).isoformat()
    resp = client.post(f"/topics/{topic['id']}/history", json={
        "source_type": "whatsapp",
        "value_snapshot": "Kickoff is next month.",
        "authority_level": "general",
        "timestamp": old_timestamp,
    })

    assert resp.status_code == 200
    assert resp.json()["latest_status"] == "stale"


def test_add_history_to_nonexistent_topic(client):
    resp = client.post("/topics/does-not-exist/history", json={
        "source_type": "whatsapp",
        "value_snapshot": "irrelevant",
    })
    assert resp.status_code == 404


def test_changes_narrative_for_no_history(client):
    topic = client.post("/topics/", json={"label": "Untouched Topic"}).json()

    resp = client.get(f"/topics/{topic['id']}/changes")
    assert resp.status_code == 200
    body = resp.json()
    assert body["history"] == []
    assert "No information" in body["narrative"]


def test_changes_narrative_reflects_contradiction_and_current_value(client):
    topic = client.post("/topics/", json={"label": "Prize Distribution"}).json()

    client.post(f"/topics/{topic['id']}/history", json={
        "source_type": "whatsapp",
        "value_snapshot": "Prize split is 50/50.",
        "authority_level": "general",
        "timestamp": (datetime.utcnow() - timedelta(days=1)).isoformat(),
    })
    client.post(f"/topics/{topic['id']}/history", json={
        "source_type": "meeting_transcript",
        "value_snapshot": "Prize split is 70/30 to first place.",
        "authority_level": "official",
        "timestamp": datetime.utcnow().isoformat(),
    })

    resp = client.get(f"/topics/{topic['id']}/changes")
    assert resp.status_code == 200
    body = resp.json()
    assert body["topic"]["latest_status"] == "disputed"
    assert "50/50" in body["narrative"]
    assert "70/30" in body["narrative"]
    assert "Current: \"Prize split is 70/30 to first place.\"" in body["narrative"]


def test_list_topics(client):
    client.post("/topics/", json={"label": "A"})
    client.post("/topics/", json={"label": "B"})

    resp = client.get("/topics/")
    assert resp.status_code == 200
    labels = {t["label"] for t in resp.json()}
    assert labels == {"A", "B"}
