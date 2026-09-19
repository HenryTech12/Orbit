"""
Recording-retrieval clients for each meeting platform (PRD: automatic
recording/transcript retrieval, reassigned to Henry).

Zoom and Microsoft Teams use entirely different APIs and auth models,
so each gets its own client behind the same RecordingClient interface;
`get_recording_client(platform)` picks the right one. Real automatic
retrieval for either platform requires admin-level access on the
account that actually hosts the meetings - that's an organizational
fact, not something more code works around. The stub backends (default,
and what every test uses) let the rest of the pipeline (webhook
handling -> meeting creation -> transcription) be built and fully
tested regardless of whether that access exists yet.

Teams specifically: Zoom's Cloud Recording API + webhook has no direct
Teams equivalent - Teams recordings/transcripts live in Microsoft Graph
(`/me/onlineMeetings`, `/communications/callRecords`, or the
`chatMessage`-linked recording depending on how the meeting was
scheduled), reached via an Azure AD app registration with organizer or
admin consent, not a simple API key. RealTeamsClient below reflects
that - it's real, runnable code, but only useful once that Azure AD app
and consent actually exist for the UniPods Teams tenant.
"""
from abc import ABC, abstractmethod
from typing import NamedTuple, Optional

from app.config import settings


class RecordingInfo(NamedTuple):
    download_url: str
    transcript_url: Optional[str]
    topic: str


class RecordingClient(ABC):
    @abstractmethod
    def get_recording(self, platform_meeting_id: str) -> RecordingInfo:
        raise NotImplementedError


# ---------- Zoom ----------

class StubZoomClient(RecordingClient):
    def get_recording(self, platform_meeting_id: str) -> RecordingInfo:
        return RecordingInfo(
            download_url=f"https://stub-zoom.local/recordings/{platform_meeting_id}.mp4",
            transcript_url=f"https://stub-zoom.local/recordings/{platform_meeting_id}.vtt",
            topic="Zoom Meeting",
        )


class RealZoomClient(RecordingClient):
    """Server-to-Server OAuth client against the real Zoom API. Requires
    ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET for an account
    with admin access to the meetings you want recordings from."""

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

    def get_recording(self, platform_meeting_id: str) -> RecordingInfo:
        import httpx

        token = self._get_access_token()
        resp = httpx.get(
            f"{self.API_BASE}/meetings/{platform_meeting_id}/recordings",
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


# ---------- Microsoft Teams ----------

class StubTeamsClient(RecordingClient):
    def get_recording(self, platform_meeting_id: str) -> RecordingInfo:
        return RecordingInfo(
            download_url=f"https://stub-teams.local/recordings/{platform_meeting_id}.mp4",
            transcript_url=f"https://stub-teams.local/recordings/{platform_meeting_id}.vtt",
            topic="Teams Meeting",
        )


class RealTeamsClient(RecordingClient):
    """Microsoft Graph client. Requires an Azure AD app registration
    (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET) with
    OnlineMeetings.Read.All / CallRecords.Read.All application
    permissions, admin-consented on the tenant that hosts the real
    UniPods Teams meetings. `platform_meeting_id` here is the Teams
    online meeting ID (or call record ID), not a simple numeric code
    like Zoom's."""

    TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    GRAPH_BASE = "https://graph.microsoft.com/v1.0"

    def _get_access_token(self) -> str:
        import httpx

        resp = httpx.post(
            self.TOKEN_URL_TEMPLATE.format(tenant_id=settings.MS_TENANT_ID),
            data={
                "client_id": settings.MS_CLIENT_ID,
                "client_secret": settings.MS_CLIENT_SECRET,
                "grant_type": "client_credentials",
                "scope": "https://graph.microsoft.com/.default",
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def get_recording(self, platform_meeting_id: str) -> RecordingInfo:
        import httpx

        token = self._get_access_token()
        resp = httpx.get(
            f"{self.GRAPH_BASE}/communications/callRecords/{platform_meeting_id}/recordings",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        recordings = data.get("value", [])
        download_url = recordings[0]["contentUrl"] if recordings else None
        return RecordingInfo(download_url=download_url, transcript_url=None, topic="Teams Meeting")


def get_recording_client(platform: str) -> RecordingClient:
    platform = (platform or "").lower()
    if platform == "zoom":
        return RealZoomClient() if settings.ZOOM_BACKEND == "real" else StubZoomClient()
    if platform == "teams":
        return RealTeamsClient() if settings.TEAMS_BACKEND == "real" else StubTeamsClient()
    # Unknown platform: default to a stub so the pipeline still runs
    # end-to-end during testing/demo rather than hard failing.
    return StubZoomClient()
