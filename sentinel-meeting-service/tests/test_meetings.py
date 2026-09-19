def test_create_meeting_with_transcript_text(client):
    resp = client.post("/meetings/", json={
        "title": "Sprint Planning",
        "platform": "zoom",
        "transcript_text": "We discussed the sprint scope and agreed on the deadline.",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Sprint Planning"
    assert body["status"] == "pending"
    assert body["id"]


def test_create_meeting_requires_recording_or_transcript(client):
    resp = client.post("/meetings/", json={"title": "No content meeting", "platform": "zoom"})
    assert resp.status_code == 422


def test_create_meeting_rejects_unknown_platform(client):
    resp = client.post("/meetings/", json={
        "title": "Weird platform",
        "platform": "carrier_pigeon",
        "transcript_text": "hello",
    })
    assert resp.status_code == 422


def test_list_meetings(client):
    client.post("/meetings/", json={"title": "M1", "transcript_text": "text one"})
    client.post("/meetings/", json={"title": "M2", "transcript_text": "text two"})

    resp = client.get("/meetings/")
    assert resp.status_code == 200
    titles = {m["title"] for m in resp.json()}
    assert titles == {"M1", "M2"}


def test_get_meeting_by_id(client):
    created = client.post("/meetings/", json={"title": "M1", "transcript_text": "text"}).json()

    resp = client.get(f"/meetings/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_meeting_not_found(client):
    resp = client.get("/meetings/does-not-exist")
    assert resp.status_code == 404


def test_process_meeting_with_existing_transcript_chunks_and_embeds(client):
    created = client.post("/meetings/", json={
        "title": "M1",
        "transcript_text": "The team discussed the deployment plan for the project.",
    }).json()

    resp = client.post(f"/meetings/{created['id']}/process")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["chunks"]) >= 1
    assert body["chunks"][0]["text"]


def test_process_meeting_transcribes_from_recording_url(client):
    created = client.post("/meetings/", json={
        "title": "Recorded Meeting",
        "recording_url": "https://example.com/recording.mp4",
    }).json()
    assert created["transcript_text"] is None

    resp = client.post(f"/meetings/{created['id']}/process")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert "stub transcript" in body["transcript_text"]
    assert len(body["chunks"]) >= 1


def test_process_nonexistent_meeting(client):
    resp = client.post("/meetings/does-not-exist/process")
    assert resp.status_code == 404
