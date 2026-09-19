def test_search_on_empty_store_returns_no_results(client):
    resp = client.post("/vectors/search", json={"query": "anything", "top_k": 5})
    assert resp.status_code == 200
    assert resp.json()["results"] == []


def test_search_finds_relevant_chunk(client):
    meeting = client.post("/meetings/", json={
        "title": "Backend Sync",
        "transcript_text": "We decided to use PostgreSQL for the database and pgvector for embeddings.",
    }).json()
    client.post(f"/meetings/{meeting['id']}/process")

    other_meeting = client.post("/meetings/", json={
        "title": "Unrelated Meeting",
        "transcript_text": "We talked about the football match and weekend plans.",
    }).json()
    client.post(f"/meetings/{other_meeting['id']}/process")

    resp = client.post("/vectors/search", json={"query": "PostgreSQL database pgvector", "top_k": 3})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) >= 1
    # The database-related chunk should score higher than an unrelated one.
    top_result = results[0]
    assert "PostgreSQL" in top_result["text"] or "pgvector" in top_result["text"]


def test_search_respects_top_k(client):
    meeting = client.post("/meetings/", json={
        "title": "Long Meeting",
        "transcript_text": " ".join([f"word{i}" for i in range(300)]),
    }).json()
    client.post(f"/meetings/{meeting['id']}/process")

    resp = client.post("/vectors/search", json={"query": "word150", "top_k": 2})
    assert resp.status_code == 200
    assert len(resp.json()["results"]) <= 2
