# Orbit

## ORBITBACKEND

Django REST backend for Orbit. It stores messages and calls the Orbit engine service (https://orbit-e873.onrender.com, docs at `/docs`), which owns meeting processing, topic trust status and history, Zoom/Teams link detection and vector search. Clients talk to this backend, which is protected by an API key, and never to the engine directly.

## Contents

- [Project layout](#project-layout)
- [Set up locally](#set-up-locally)
- [Local API reference](#local-api-reference)
- [Authentication](#authentication)
- [Data model](#data-model)
- [Conventions](#conventions)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## Project layout

```
orbit_backend/
├── Dockerfile, docker-compose.yml, .env.example, .gitignore, README.md
└── orbit_app/                 the single Django app + project
    ├── manage.py, requirements.txt, settings.py, celery.py, urls.py
    ├── core/                  health check and API-key authentication
    ├── engine/                client, views and URLs for the engine service
    ├── messages/              messages table
    ├── softdelete.py          soft-delete base model
    └── migrations/
```

- The whole backend is one Django app, `orbit_app`. Each table lives in its own sub-package.
- A new model must also be imported in `orbit_app/models.py`, or Django won't see it.
- The app label is deliberately `orbitbackend` (`label` in `orbit_app/apps.py`), because the database and the migrations refer to it. Don't change it without a data migration.

## Set up locally

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- Python 3.13, only if you want to run Django outside Docker
- [Postman](https://www.postman.com/) or `curl` for testing

### 1. Create your `.env`

```
cp .env.example .env
```

Open `.env` and fill it in. These values work for local development:

```
DEBUG=True
SECRET_KEY=<generate one, see below>
ALLOWED_HOSTS=localhost,127.0.0.1

POSTGRES_DB=orbitbackend
POSTGRES_USER=orbitbackend
POSTGRES_PASSWORD=<choose a password>
POSTGRES_HOST=localhost
POSTGRES_PORT=5433

CORS_ALLOWED_ORIGINS=http://localhost:3000

REDIS_PORT=6379
CELERY_BROKER_URL=redis://localhost:6379/0

ORBIT_API_KEYS=<generate one, see below>
```

Generate a Django secret key and an API key (run each command once):

```
python3 -c "import secrets; print(secrets.token_urlsafe(50))"    # SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(32))"    # ORBIT_API_KEYS
```

- `.env` is gitignored. Never commit it or share the keys.
- `ORBIT_API_KEYS` can hold several keys, comma-separated. Give each client its own.
- Optional settings: `ORBIT_ENGINE_URL` (defaults to the deployed engine), `ORBIT_ENGINE_API_KEY` (for when the engine adds authentication), `ORBIT_ENGINE_TIMEOUT` (seconds, default 90) and `WEB_PORT` (default 8000).

### 2. Start everything with Docker

```
docker compose up -d --build
```

This starts four containers under the project name `orbit`:

| Service | Local address | Notes |
|---|---|---|
| `web` (Django API) | http://localhost:8000 | runs `migrate`, then the dev server; code is mounted, so edits reload automatically |
| `postgres` | `localhost:5433` | user, password and database come from `.env` |
| `redis` | `localhost:6379` | Celery broker |
| `adminer` | http://localhost:8081 | database browser (System: PostgreSQL, Server: `postgres`) |

Check it worked:

```
docker compose ps
curl http://localhost:8000/api/health/          # {"status":"ok"}
```

### 3. Create an admin user (optional)

```
docker compose exec web python orbit_app/manage.py createsuperuser
```

Then sign in at http://localhost:8000/admin/.

### 4. Everyday commands

```
docker compose logs -f web                                          # follow the Django logs
docker compose exec web python orbit_app/manage.py migrate          # apply migrations
docker compose exec web python orbit_app/manage.py makemigrations   # create migrations
docker compose exec web python orbit_app/manage.py test orbit_app   # run the tests
docker compose up -d --build                                        # rebuild after changing requirements.txt or the Dockerfile
docker compose up -d --force-recreate web                           # pick up changes to .env
docker compose down                                                 # stop everything (keeps the database)
```

Never run `docker compose down -v` unless you want to wipe the database.

### Alternative: run Django without Docker

Use Docker only for Postgres and Redis, and run Django on your machine. The `POSTGRES_HOST=localhost` and `POSTGRES_PORT=5433` values in your `.env` are what this mode uses.

```
docker compose up -d postgres redis
python3.13 -m venv venv && source venv/bin/activate
pip install -r orbit_app/requirements.txt
python orbit_app/manage.py migrate
python orbit_app/manage.py runserver
```

## Local API reference

Base URL: `http://localhost:8000`

Send your key on every request except health, as `X-API-Key: <key>` or `Authorization: Bearer <key>` (with a space after `Bearer`). For POST requests, use `Content-Type: application/json`.

| Method | URL | Body | Purpose |
|---|---|---|---|
| GET | `/api/health/` | none | Health check (no key needed) |
| GET | `/admin/` | none | Django admin (browser login) |
| **Topics** | | | |
| GET | `/api/engine/topics/` | none | List topics |
| POST | `/api/engine/topics/` | `{"label": "Launch date"}` | Create a topic (409 if it exists) |
| GET | `/api/engine/topics/{topic_id}/` | none | Get one topic |
| POST | `/api/engine/topics/{topic_id}/history/` | see below | Add a history entry |
| GET | `/api/engine/topics/{topic_id}/changes/` | none | History plus a "what changed" narrative |
| **Meetings** | | | |
| GET | `/api/engine/meetings/` | none | List meetings |
| POST | `/api/engine/meetings/` | see below | Create a meeting |
| GET | `/api/engine/meetings/{meeting_id}/` | none | Get one meeting |
| POST | `/api/engine/meetings/{meeting_id}/process/` | none | Transcribe, chunk, embed and store (slow) |
| **Meeting links** | | | |
| POST | `/api/engine/meeting-links/detect/` | see below | Find a Zoom/Teams link and time in a chat message |
| GET | `/api/engine/meeting-links/detections/` | none | List detections |
| GET | `/api/engine/meeting-links/reminders/due/` | none | Reminders that are due |
| POST | `/api/engine/meeting-links/reminders/{reminder_id}/sent/` | none | Mark a reminder as sent |
| **Vector search** | | | |
| POST | `/api/engine/vectors/search/` | `{"query": "shipping date", "top_k": 5}` | Nearest-neighbour search (`top_k` is 1 to 50) |

**Request bodies**

Add topic history:
```json
{
  "source_type": "whatsapp",
  "source_id": "42",
  "value_snapshot": "Launch is on 12 October",
  "authority_level": "official",
  "timestamp": "2026-09-20T09:00:00Z"
}
```
`source_type` is `whatsapp`, `meeting_transcript` or `pdf`. `authority_level` is `official` or `general`. `timestamp` is optional.

Create a meeting:
```json
{
  "title": "Weekly sync",
  "platform": "zoom",
  "scheduled_time": "2026-09-21T15:00:00Z",
  "transcript_text": "Alice: we ship on Friday. Bob: agreed."
}
```
`platform` is `zoom`, `teams`, `google_meet` or `other`. Provide `recording_url` or `transcript_text`, or you get a 400. `scheduled_time` is optional.

Detect a meeting link:
```json
{
  "message": "Join us at https://zoom.us/j/123456789 tomorrow at 3pm",
  "reference_time": "2026-09-20T09:00:00Z"
}
```

**Example with curl**
```
curl -H "X-API-Key: $ORBIT_KEY" http://localhost:8000/api/engine/topics/

curl -X POST http://localhost:8000/api/engine/topics/ \
  -H "X-API-Key: $ORBIT_KEY" -H "Content-Type: application/json" \
  -d '{"label": "Launch date"}'
```

**Response codes**

| Code | Meaning |
|---|---|
| 200 / 201 | Success |
| 400 | The body failed validation (the message names the field) |
| 401 | Key missing or wrong |
| 409 | Duplicate topic (passed through from the engine) |
| 502 | The engine was unreachable or failed |

The first call that reaches the engine after a quiet period can take up to a minute, because it runs on Render's free tier and sleeps.

## Authentication

- Every route except `/api/health/` requires an API key. The check is in `orbit_app/core/auth.py`.
- Valid keys are listed in `ORBIT_API_KEYS`. With no keys configured, every request is rejected.
- A missing key returns `Authentication credentials were not provided.`. A wrong key returns `Invalid API key.`.
- The engine itself has no authentication yet, so keep its URL out of client apps. When it gets a key check, set `ORBIT_ENGINE_API_KEY` and the client sends it as a Bearer token.

## Data model

| Table | Columns |
|---|---|
| `messages` | `message_id`, `source_type`, `sender`, `timestamp`, `raw_text`, `authority_level`, `deleted_at` |

- Chunks, embeddings, topics, topic history and meetings are owned by the engine service, so they have no tables here.
- **Soft delete:** models inherit `SoftDeleteModel` (`orbit_app/softdelete.py`), which adds `deleted_at`. `.delete()` sets it instead of removing the row. `Model.objects` hides deleted rows, `Model.all_objects` includes them, and `.restore()` and `.hard_delete()` are available.
- Primary keys are named `<table>_id`, for example `message_id`.

## Conventions

- Migration files are named `2029_09_<HHMMSS>_<action>.py`, for example `2029_09_084500_add_soft_delete.py`. Generate with `makemigrations -n <action>`, then rename the file.

## Troubleshooting

| Problem | Fix |
|---|---|
| `port is already allocated` | Another container or program uses the port. Check `docker ps`, and always run compose from this folder so it reuses the `orbit` project. |
| 401 in Postman | Use `Bearer <key>` with a space, or send `X-API-Key`. Check that your Postman variable resolves. |
| Changed `.env` but nothing changed | Run `docker compose up -d --force-recreate web`. |
| `password authentication failed` | Changing `POSTGRES_PASSWORD` doesn't change an existing volume. Run `ALTER USER` inside Postgres too. |
| Docker build fails installing requirements | Keep `requirements.txt` in sync with a working environment. Django is pinned to 6.0.8 because `django-celery-beat` needs Django below 6.1. |

## Known limitations

- The engine has no authentication yet, and its Teams, embeddings and vector search backends are still stubs.
- `/process` runs inside the request and can be slow. It should become a Celery task.
- The Django dev server is used in Docker. It isn't meant for production.
- Message endpoints are not written yet.
