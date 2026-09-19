# Sentinel — Henry's Backend Services

FastAPI implementation of Henry's slice of the Sentinel PRD (Team Orbit,
UniPods Hackathon 2026):

1. **Meeting recording/transcript pipeline** (Whisper — stub, Groq, or OpenAI)
2. **pgvector storage + HNSW indexing**
3. **`topic_history` table and contradiction/change-detection query logic**
4. **Meeting-link detection → reminder → automatic recording/transcript
   processing**, supporting **both Zoom and Microsoft Teams** — generalized
   after a live test of the deployed bot revealed the real UniPods
   community actually uses Teams links, not Zoom

The PRD specifies Django/Celery/Redis as the overall team stack; this
service is built in **FastAPI** per an explicit request to have Henry's
slice built that way. It's a standalone service with its own database
and can run independently (exposed over HTTP for the rest of the team's
app to call) or serve as the reference implementation to port into the
shared Django app.

## What's real vs. stubbed, and why

Every external dependency (transcription, embeddings, Zoom/Teams
recording retrieval) sits behind a pluggable interface with a **stub**
implementation (deterministic, offline, no credentials — used by
default and by every test) and one or more **real** implementations.
This means:

- The service runs and all 64 tests pass with **zero setup**.
- Switching to real transcription/embeddings/recording access is a
  **config change** (environment variables), not a code change.
- **Automatic recording retrieval for either platform requires
  admin-level access to the account that actually hosts the
  meetings** — that's an organizational fact, not something more code
  routes around. For Zoom, that's Server-to-Server OAuth credentials.
  For Teams, it's an Azure AD app registration with admin consent on
  the tenant (Teams recordings live in Microsoft Graph, not a simple
  API-key endpoint — a materially different, and generally harder,
  setup than Zoom's). If your team doesn't have that access on the
  real UniPods Teams tenant, the webhook flow (`POST
  /meeting-links/webhook`) still works and is fully tested — point it
  at a Teams (or Zoom) account you *do* control for the demo video.

## Transcription: Groq, OpenAI, or stub

`TRANSCRIPTION_BACKEND=groq` uses Groq's hosted Whisper
(`whisper-large-v3-turbo` by default) via its OpenAI-compatible audio
endpoint — it has a free tier, which is why it's the recommended real
backend for a hackathon budget. Set `GROQ_API_KEY` to use it. This is
separate from *embeddings*: Groq doesn't offer an embeddings endpoint,
so `EMBEDDING_BACKEND` still only supports `stub` or `openai`. (If the
team also wants to move the Responder's *text-generation* LLM calls —
outside this service, owned by Kamate/Mamadou — to Groq's free tier
Llama models, that's a separate, unrelated config change in their code,
not this service.)

## Quickstart

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for interactive Swagger UI covering
every endpoint below. Default setup uses a local SQLite file
(`sentinel_henry.db`, created automatically) and offline stub backends
— nothing else to configure to try it out.

## Running the tests

```bash
pytest -v
```

64 tests, all passing: every endpoint (happy path + error cases —
not-found, validation, duplicate, empty-state) for both Zoom and Teams,
plus the pure logic in isolation (link/date detection for both
platforms, trust-status computation, change-narrative building,
transcription backend selection).

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

Trust status (`confirmed` / `disputed` / `stale` / `unknown`) follows
the PRD's Section 6.1 precedence: no history → unknown; conflicting
values → disputed (even if recent); a single consistent value older
than `STALE_AFTER_DAYS` (default 5) → stale; otherwise → confirmed.
Source-authority weighting (`official` outranks `general`) decides
which value counts as "current" in a dispute.

### Meeting links — detect → remind → auto-process (Zoom + Teams)
| Method | Path | Purpose |
|---|---|---|
| POST | `/meeting-links/detect` | Scan a chat message for a Zoom **or Teams** link + meeting time; schedules a reminder if both are found |
| GET | `/meeting-links/detections` | List all detections |
| GET | `/meeting-links/reminders/due` | Reminders whose time has arrived (poll this from whatever sends the actual message) |
| POST | `/meeting-links/reminders/{id}/sent` | Mark a reminder as sent |
| POST | `/meeting-links/webhook` | Simulates the platform's recording-ready notification: fetches the recording and runs the full pipeline automatically |

The webhook payload takes a `platform` field (`"zoom"` or `"teams"`) so
the same endpoint serves both.

### Vectors — storage/search infrastructure
| Method | Path | Purpose |
|---|---|---|
| POST | `/vectors/search` | Nearest-neighbor search over stored transcript chunks |

This is the storage/indexing layer Henry owns per the PRD. Full hybrid
(vector + BM25) retrieval and grounded generation on top of it is
Kamate/Mamadou's Responder.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./sentinel_henry.db` | Set to a `postgresql://...` URL + apply `sql/init_pgvector.sql` for the production pgvector path |
| `TRANSCRIPTION_BACKEND` | `stub` | `groq` (recommended, free tier) or `openai` for real transcription |
| `GROQ_API_KEY` | *(empty)* | Required if `TRANSCRIPTION_BACKEND=groq` |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | Groq's hosted Whisper model to use |
| `OPENAI_API_KEY` | *(empty)* | Required if `TRANSCRIPTION_BACKEND=openai` or `EMBEDDING_BACKEND=openai` |
| `EMBEDDING_BACKEND` | `stub` | `openai` for real embeddings (Groq has no embeddings endpoint) |
| `ZOOM_BACKEND` | `stub` | `real` for actual Zoom API calls |
| `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | *(empty)* | Zoom Server-to-Server OAuth credentials |
| `TEAMS_BACKEND` | `stub` | `real` for actual Microsoft Graph calls |
| `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` | *(empty)* | Azure AD app registration credentials, admin-consented on the Teams tenant |
| `STALE_AFTER_DAYS` | `5` | Days without an update before a topic is flagged stale |
| `REMINDER_LEAD_MINUTES` | `30` | How long before a detected meeting the reminder fires |

## Production pgvector migration

`sql/init_pgvector.sql` contains the real Postgres + pgvector schema (a
`vector(384)` column with an HNSW index). Apply it once `DATABASE_URL`
points at a real Postgres instance — the service automatically
switches from SQLite/numpy similarity search to real pgvector queries
based on the URL scheme (see `app/services/vector_store.py`).

## Project layout

```
app/
  main.py                          FastAPI app + router wiring
  config.py                        All environment-driven settings
  database.py                      SQLAlchemy engine/session
  models.py                        Meeting, TranscriptChunk, Topic, TopicHistoryEntry, MeetingDetection, ReminderJob
  schemas.py                       Pydantic request/response models
  services/
    transcription.py               Whisper: stub, Groq, OpenAI
    embeddings.py                  Embedding model (stub + real) + text chunking
    vector_store.py                SQLite/numpy search + production pgvector path
    contradiction.py               Trust-status + change-narrative logic
    meeting_link_detection.py      Zoom + Teams link/date extraction from raw messages
    recording_clients.py           Zoom + Teams recording-retrieval clients (stub + real)
    reminders.py                   Reminder scheduling/due-tracking
    meeting_pipeline.py            Shared transcribe->chunk->embed->store pipeline
  routers/
    meetings.py, topics.py, meeting_links.py, vectors.py
tests/                             64 tests, one file per router + per pure-logic module
sql/init_pgvector.sql              Production Postgres+pgvector schema
```
