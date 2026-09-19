from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db
from app.routers import meetings, topics, meeting_links, vectors


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Sentinel - Henry's Backend Services",
    description=(
        "Meeting recording/transcript pipeline, pgvector storage, "
        "topic_history contradiction detection, and the Zoom/Teams "
        "detect->remind->auto-process feature - Team Orbit, UniPods Hackathon."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(meetings.router)
app.include_router(topics.router)
app.include_router(meeting_links.router)
app.include_router(vectors.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
