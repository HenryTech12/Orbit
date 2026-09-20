# Orbit

## ORBITBACKEND

Django backend for Orbit. It stores messages and talks to the Orbit engine service (https://orbit-e873.onrender.com, docs at `/docs`), which owns meeting processing, contradiction / topic-history logic, Zoom/Teams link detection and pgvector search.

## Project layout

```
orbit_backend/
├── .env.example, .gitignore, README.md, docker-compose.yml
└── orbit_app/                 the single Django app + project
    ├── manage.py, requirements.txt, settings.py, celery.py, urls.py
    ├── core/                  health-check endpoint
    ├── messages/              messages table
    ├── engine/                client for the Orbit engine service (services.py)
    ├── softdelete.py
    └── migrations/
```

- The whole backend is one Django app, `orbit_app`. Each table lives in its own sub-package (`models.py`, plus serializers, services, tasks and views files).
- **Registering models:** a new model must also be imported in `orbit_app/models.py`, or Django won't see it.
- **App label:** the app label is deliberately kept as `orbitbackend` (`label` in `orbit_app/apps.py`). The database and the migrations refer to it. Don't change it without a data migration.

## Tables

| Table | Columns |
|---|---|
| `messages` | `message_id`, `source_type`, `sender`, `timestamp`, `raw_text`, `authority_level`, `deleted_at` |

Chunks, embeddings, classifications, topics, topic history and action items are handled by the engine service, so they have no tables here.

- **Soft delete:** models inherit `SoftDeleteModel` (`orbit_app/softdelete.py`), which adds a `deleted_at` column. `.delete()` sets it instead of removing the row. `Model.objects` hides deleted rows, and `Model.all_objects` includes them. Helpers: `.restore()` and `.hard_delete()`.
- **Primary keys** are named `<table>_id`, for example `message_id`.

## Conventions

- **Migration files** follow `2029_09_<HHMMSS>_<action>.py`, for example `2029_09_084500_add_soft_delete.py`. Generate with `makemigrations -n <action>`, then rename the file.

## Engine service

`orbit_app/engine/services.py` has `EngineClient` (`get_engine_client()`), with one method per engine endpoint. Configure it with `ORBIT_ENGINE_URL`, `ORBIT_ENGINE_API_KEY` and `ORBIT_ENGINE_TIMEOUT` (see `.env.example`). The engine runs on Render's free tier, so the first call after idle can be slow.

## API and authentication

Clients call this backend, never the engine directly. `/api/engine/...` proxies to the engine (topics, meetings, meeting links, vector search). Every route except `/api/health/` requires an API key, sent as `Authorization: Bearer <key>` or `X-API-Key: <key>`. Valid keys are listed in `ORBIT_API_KEYS` (comma-separated, in `.env`). With no keys configured, every key is rejected. The engine itself has no auth yet, so keep its URL out of client apps and ask for a key check on its side.

## Running it

```
cp .env.example .env               # then fill in the values (including ORBIT_API_KEYS)
docker compose up -d --build       # Django API (localhost:8000), Postgres 16, Redis, Adminer (localhost:8081)
```

- The `web` container runs `migrate` and then the Django dev server on start. Code is bind-mounted, so edits reload automatically.
- Logs: `docker compose logs -f web`. Run a command inside it: `docker compose exec web python orbit_app/manage.py <command>`.
- After changing `requirements.txt` or the `Dockerfile`, rebuild with `docker compose up -d --build`.
- Postgres is on host port `5433`. Inside Docker the app reaches it as `postgres:5432` (set by `docker-compose.yml`, so `POSTGRES_HOST` in `.env` only matters when running Django outside Docker).
- The compose project is named `orbit` (`name:` in `docker-compose.yml`), so it always reuses the same containers and volumes no matter which folder you run it from.
- Changing `POSTGRES_PASSWORD` in `.env` doesn't change the password of an existing volume. Run `ALTER USER` inside Postgres as well.
- Without Docker: `pip install -r orbit_app/requirements.txt` then `python orbit_app/manage.py runserver`.

## Known limitations

- The engine documents no authentication yet, so its endpoints are open.
- The message flows, Celery tasks and API views that use the engine are not written yet. The only working endpoint is `core`'s health check.
