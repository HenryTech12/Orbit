from unittest.mock import patch, MagicMock

from app.config import settings
from app.services.transcription import (
    get_transcription_backend, StubTranscriptionBackend, GroqTranscriptionBackend, OpenAIWhisperBackend,
)


def test_default_backend_is_stub():
    backend = get_transcription_backend()
    assert isinstance(backend, StubTranscriptionBackend)


def test_stub_backend_transcribes_deterministically():
    backend = StubTranscriptionBackend()
    result1 = backend.transcribe("https://example.com/a.mp3")
    result2 = backend.transcribe("https://example.com/a.mp3")
    assert result1 == result2
    assert "stub transcript" in result1


def test_backend_selection_respects_config(monkeypatch):
    monkeypatch.setattr(settings, "TRANSCRIPTION_BACKEND", "groq")
    assert isinstance(get_transcription_backend(), GroqTranscriptionBackend)

    monkeypatch.setattr(settings, "TRANSCRIPTION_BACKEND", "openai")
    assert isinstance(get_transcription_backend(), OpenAIWhisperBackend)

    monkeypatch.setattr(settings, "TRANSCRIPTION_BACKEND", "stub")
    assert isinstance(get_transcription_backend(), StubTranscriptionBackend)


@patch("httpx.post")
@patch("httpx.stream")
def test_groq_backend_calls_expected_endpoint(mock_stream, mock_post, monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "fake-key")

    mock_download = MagicMock()
    mock_download.__enter__.return_value.iter_bytes.return_value = [b"fake-audio-bytes"]
    mock_download.__enter__.return_value.raise_for_status.return_value = None
    mock_stream.return_value = mock_download

    mock_response = MagicMock()
    mock_response.json.return_value = {"text": "This is the transcribed text."}
    mock_response.raise_for_status.return_value = None
    mock_post.return_value = mock_response

    backend = GroqTranscriptionBackend()
    result = backend.transcribe("https://example.com/recording.mp3")

    assert result == "This is the transcribed text."
    called_url = mock_post.call_args[0][0]
    assert "groq.com" in called_url
