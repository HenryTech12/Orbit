"""
Zoom Cloud Recording API client (PRD: automatic recording/transcript
retrieval, reassigned to Henry).

Real automatic retrieval requires admin access to the Zoom account that
actually hosts the meetings (Server-to-Server OAuth credentials +
webhook subscription for `recording.completed`) - see README for the
setup this depends on. The stub backend below lets the rest of the
pipeline (webhook handling -> meeting creation -> transcription) be
built and fully tested without that access being available yet.
"""
from abc import ABC, abstractmethod
from typing import NamedTuple, Optional

from app.config import settings


class RecordingInfo(NamedTuple):
    download_url: str
    transcript_url: Optional[str]
    topic: str


class ZoomClient(ABC):
    @abstractmethod
    def get_recording(self, zoom_meeting_id: str) -> RecordingInfo:
        raise NotImplementedError


class StubZoomClient(ZoomClient):
    def get_recording(self, zoom_meeting_id: str) -> RecordingInfo:
        return RecordingInfo(
            download_url=f"https://stub-zoom.local/recordings/{zoom_meeting_id}.mp4",
            transcript_url=f"https://stub-zoom.local/recordings/{zoom_meeting_id}.vtt",
            topic="Zoom Meeting",
        )


class RealZoomClient(ZoomClient):
    """Server-to-Server OAuth client against the real Zoom API.

    Requires ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET to be
    set for an account with admin access to the meetings you want to
    pull recordings from - Zoom does not expose another team's
    recordings via API regardless of code correctness.
    """

    TOKEN_URL = "https://zoom.us/oauth/token"
    API_BASE = "https://api.zoom.us/v2"

    def _get_access_token(self) -> str:
        import httpx

        resp = httpx.post(
            self.TOKEN_URL,
            params={"grant_type": "account_credentials", "account_id": settings.ZOOM_ACCOUNT_ID},
            auth=(settings.ZOOM_CLIENT_ID, settings.ZOOM_CLIENT_SECRET),
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def get_recording(self, zoom_meeting_id: str) -> RecordingInfo:
        import httpx

        token = self._get_access_token()
        resp = httpx.get(
            f"{self.API_BASE}/meetings/{zoom_meeting_id}/recordings",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        files = data.get("recording_files", [])
        download_url = next((f["download_url"] for f in files if f["file_type"] == "MP4"), None)
        transcript_url = next((f["download_url"] for f in files if f["file_type"] == "TRANSCRIPT"), None)
        return RecordingInfo(
            download_url=download_url, transcript_url=transcript_url, topic=data.get("topic", "Zoom Meeting")
        )


def get_zoom_client() -> ZoomClient:
    if settings.ZOOM_BACKEND == "real":
        return RealZoomClient()
    return StubZoomClient()
