"""
Meeting recording -> transcript pipeline (PRD Section 6, Henry's ownership).

Real deployment: set TRANSCRIPTION_BACKEND=openai and OPENAI_API_KEY to
transcribe actual recording audio via the Whisper API (or swap in
Faster-Whisper locally - same interface, different implementation).

Default/test: a deterministic stub that needs no network access or
credentials, so the service and its tests run anywhere out of the box.
"""
from abc import ABC, abstractmethod

from app.config import settings


class TranscriptionBackend(ABC):
    @abstractmethod
    def transcribe(self, audio_url: str) -> str:
        """Return the full transcript text for a given recording URL."""
        raise NotImplementedError


class StubTranscriptionBackend(TranscriptionBackend):
    """Deterministic, offline stand-in used by default and in tests."""

    def transcribe(self, audio_url: str) -> str:
        return (
            f"[stub transcript for {audio_url}] "
            "The team discussed the project timeline. "
            "We agreed to use PostgreSQL for storage. "
            "David will handle backend integration before Friday."
        )


class OpenAIWhisperBackend(TranscriptionBackend):
    """Real backend - requires the `openai` package and OPENAI_API_KEY.

    Kept separate from the stub so swapping in real transcription for
    the actual hackathon deployment is a one-line config change, not a
    code change.
    """

    def transcribe(self, audio_url: str) -> str:
        import openai  # imported lazily so the stub path has no hard dependency

        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        import urllib.request
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
            urllib.request.urlretrieve(audio_url, tmp.name)
            with open(tmp.name, "rb") as audio_file:
                result = client.audio.transcriptions.create(
                    model="whisper-1", file=audio_file
                )
        return result.text


def get_transcription_backend() -> TranscriptionBackend:
    if settings.TRANSCRIPTION_BACKEND == "openai":
        return OpenAIWhisperBackend()
    return StubTranscriptionBackend()
