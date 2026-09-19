"""
Configuration for Henry's Sentinel backend service.

Everything that talks to a real external system (Whisper transcription,
an embedding model, the Zoom API) is driven off environment variables so
the service runs and tests pass with zero external credentials, and can
be pointed at real providers for the actual hackathon deployment by
setting the corresponding env vars.
"""
import os


class Settings:
    # Database. Defaults to a local SQLite file so the service runs with
    # zero setup. Point DATABASE_URL at a real Postgres+pgvector instance
    # for production (see sql/init_pgvector.sql for the schema).
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./sentinel_henry.db")
    USE_PGVECTOR: bool = DATABASE_URL.startswith("postgresql")

    # Embedding dimension used throughout (matches bge-small-en, the
    # model named in the PRD's tech stack).
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "384"))

    # Transcription backend: "stub" (deterministic, offline, used by
    # default and in tests) or "openai" (real Whisper API - requires
    # OPENAI_API_KEY).
    TRANSCRIPTION_BACKEND: str = os.getenv("TRANSCRIPTION_BACKEND", "stub")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # Embedding backend: "stub" (deterministic hash-based, offline) or
    # "openai".
    EMBEDDING_BACKEND: str = os.getenv("EMBEDDING_BACKEND", "stub")

    # Zoom API backend: "stub" (offline, used by default and in tests) or
    # "real" (requires Zoom Server-to-Server OAuth credentials).
    ZOOM_BACKEND: str = os.getenv("ZOOM_BACKEND", "stub")
    ZOOM_ACCOUNT_ID: str = os.getenv("ZOOM_ACCOUNT_ID", "")
    ZOOM_CLIENT_ID: str = os.getenv("ZOOM_CLIENT_ID", "")
    ZOOM_CLIENT_SECRET: str = os.getenv("ZOOM_CLIENT_SECRET", "")

    # A topic is considered "stale" if its last update is older than this
    # many days (PRD Section 6.1).
    STALE_AFTER_DAYS: int = int(os.getenv("STALE_AFTER_DAYS", "5"))

    # How long before a detected Zoom meeting to send a reminder.
    REMINDER_LEAD_MINUTES: int = int(os.getenv("REMINDER_LEAD_MINUTES", "30"))


settings = Settings()
