# Sentinel — Henry's Backend Services

FastAPI implementation of Henry's slice of the Sentinel PRD (Team Orbit,
UniPods Hackathon 2026):

1. **Meeting recording/transcript pipeline** (Whisper integration)
2. **pgvector storage + HNSW indexing**
3. **`topic_history` table and contradiction/change-detection query logic**
4. **Zoom meeting detection → reminder → automatic recording/transcript
   processing** (the feature originally floated for Victor, reassigned
   to Henry)

The PRD specifies Django/Celery/Redis as the overall team stack; this
service is built in **FastAPI** per an explicit request to have Henry's
slice built that way. It is a standalone service with its own database
tables and can either run independently (exposing these capabilities
over HTTP for the rest of the team's Django service to call) or serve
as the reference implementation to port into the shared Django app.

## What's real vs. stubbed, and why

Every external dependency (Whisper transcription, the embedding model,
the Zoom API) is behind a pluggable interface with two implementations:
a **stub** (deterministic, offline, no credentials needed — used by
default and by every test) and a **real** one (requires actual API
keys / Zoom admin credentials). This means:

- The service runs and all 52 tests pass with **zero setup** — no
  Postgres, no OpenAI key, no Zoom account needed.
- Switching to real transcription/embeddings/Zoom access for the actual
  demo is a **config change** (environment variables), not a code
  change — see `app/config.py`.
- The one thing no amount of code can substitute for: **automatic Zoom
  recording retrieval requires admin access to the Zoom account that
  hosts the real meetings** (to register the `recording.completed`
  webhook and pull recordings via API). If your team doesn't have that
  access on the account UniPods actually uses for calls, the webhook
  flow (`POST /zoom/webhook`) still works and is fully tested — just
  point it at a Zoom account you *do* control (e.g. record a demo
  meeting on your own free-tier Zoom account) for the video.

## Quickstart

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

Then open `http://localhost:8000/docs` for interactive Swagger UI
covering every endpoint below.

Default setup uses a local SQLite file (`sentinel_henry.db`, created
automatically) and offline stub backends — nothing else to configure
to try it out.

## Running the tests

```bash
pytest -v
```

52 tests, all passing, covering every endpoint (happy path + error
cases: not-found, validation, duplicate, empty-state) plus the pure
logic in isolation (Zoom link/date detection, trust-status computation,
change-narrative building).

## API overview

### Meetings — recording/transcript pipeline
| Method | Path | Purpose |
|---|---|---|
| POST | `/meetings/` | Create a meeting (with a `recording_url` to transcribe, or `transcript_text` directly) |
| GET | `/meetings/` | List all meetings |
| GET | `/meetings/{id}` | Get one meeting with its processed chunks |
| POST | `/meetings/{id}/process` | Run transcribe → chunk → embed → store |

### Topics — contradiction/change detection (`topic_history`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/topics/` | Create a topic |
| GET | `/topics/` | List topics |
| GET | `/topics/{id}` | Get one topic + its current trust status |
| POST | `/topics/{id}/history` | Add a history entry (recomputes status) |
| GET | `/topics/{id}/changes` | Full timeline + "what changed" narrative |

Trust status (`confirmed` / `disputed` / `stale` / `unknown`) is
computed exactly per the PRD's Section 6.1 precedence: no history →
unknown; conflicting values → disputed (even if recent); a single
consistent value older than `STALE_AFTER_DAYS` (default 5) → stale;
otherwise → confirmed. Source-authority weighting (`official` outranks
`general`) decides which value is treated as "current" in a dispute.

### Zoom — detect → remind → auto-process
| Method | Path | Purpose |
|---|---|---|
| POST | `/zoom/detect` | Scan a chat message for a Zoom link + meeting time; schedules a reminder if both are found |
| GET | `/zoom/detections` | List all detections |
| GET | `/zoom/reminders/due` | Reminders whose time has arrived (poll this from whatever sends the actual message) |
| POST | `/zoom/reminders/{id}/sent` | Mark a reminder as sent |
| POST | `/zoom/webhook` | Simulates Zoom's `recording.completed` event: fetches the recording and runs it through the full pipeline automatically, no manual step |

### Vectors — storage/search infrastructure
| Method | Path | Purpose |
|---|---|---|
| POST | `/vectors/search` | Nearest-neighbor search over stored transcript chunks |

This is the storage/indexing layer Henry owns per the PRD. Full hybrid
(vector + BM25) retrieval and grounded answer generation on top of it
is Kamate/Mamadou's Responder — this endpoint exists so that piece has
something real to call, and so the storage layer is independently
testable.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./sentinel_henry.db` | Set to a `postgresql://...` URL + apply `sql/init_pgvector.sql` to switch to the production pgvector path |
| `TRANSCRIPTION_BACKEND` | `stub` | `openai` for real Whisper API transcription |
| `EMBEDDING_BACKEND` | `stub` | `openai` for real embeddings |
| `OPENAI_API_KEY` | *(empty)* | Required if either backend above is `openai` |
| `ZOOM_BACKEND` | `stub` | `real` for actual Zoom API calls |
| `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | *(empty)* | Zoom Server-to-Server OAuth credentials, required for `ZOOM_BACKEND=real` |
| `STALE_AFTER_DAYS` | `5` | How many days without an update before a topic is flagged stale |
| `REMINDER_LEAD_MINUTES` | `30` | How long before a detected meeting the reminder fires |

## Production pgvector migration

`sql/init_pgvector.sql` contains the real Postgres + pgvector schema
(a `vector(384)` column with an HNSW index) matching the PRD's
Knowledge Processing Layer spec. Apply it once `DATABASE_URL` points
at a real Postgres instance; the service automatically switches from
the SQLite/numpy similarity search to real pgvector queries based on
the URL scheme (see `app/services/vector_store.py`).

## Project layout

```
app/
  main.py                     FastAPI app + router wiring
  config.py                   All environment-driven settings
  database.py                 SQLAlchemy engine/session
  models.py                   Meeting, TranscriptChunk, Topic, TopicHistoryEntry, ZoomDetection, ReminderJob
  schemas.py                  Pydantic request/response models
  services/
    transcription.py          Whisper (stub + real)
    embeddings.py              Embedding model (stub + real) + text chunking
    vector_store.py             SQLite/numpy search + production pgvector path
    contradiction.py             Trust-status + change-narrative logic
    zoom_detection.py             Zoom link/date extraction from raw messages
    zoom_client.py                 Zoom Cloud Recording API client (stub + real)
    reminders.py                    Reminder scheduling/due-tracking
    meeting_pipeline.py               Shared transcribe->chunk->embed->store pipeline
  routers/
    meetings.py, topics.py, zoom.py, vectors.py
tests/                        52 tests, one file per router + per pure-logic module
sql/init_pgvector.sql         Production Postgres+pgvector schema
```
