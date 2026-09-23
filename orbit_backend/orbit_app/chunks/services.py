"""Step 2: Ingestion, Chunking & Embeddings pipeline.

Text is split into overlapping chunks of ~512 tokens (64 token overlap)
and each chunk is embedded with ``bge-small-en`` (384 dimensions).

Chunking uses ``langchain_text_splitters.RecursiveCharacterTextSplitter``
when available, with a pure-Python sliding-window fallback so the pipeline
(and its tests) still run without optional dependencies.

Embedding backend priority:
  1. Hugging Face Inference API (when HF_API_KEY is set).
  2. Local CPU execution via ``sentence-transformers``.
  3. Deterministic offline fallback (hash-based, 384-d, L2-normalised).

Every backend is validated to return exactly 384 dimensions per vector,
matching the chunks-table schema (ArrayField of 384 floats; pgvector-ready
and migratable to VectorField(dimensions=384) later).

This module has NO Django imports at import time so chunk_text and
generate_embeddings can be exercised standalone:

    python -m orbit_app.chunks.services --self-test
"""

from __future__ import annotations

import hashlib
import logging
import math
import os

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

#: Hugging Face id of the embedding model (bge-small-en -> 384 dimensions).
EMBEDDING_MODEL_NAME = os.environ.get(
    "EMBEDDING_MODEL_NAME", "BAAI/bge-small-en-v1.5"
)
#: Embedding dimensionality for bge-small-en.
EMBEDDING_DIMENSIONS = int(os.environ.get("EMBEDDING_DIMENSIONS", "384"))

#: Default chunking parameters: ~512 tokens per chunk, 64 tokens overlap.
DEFAULT_CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "512"))
DEFAULT_CHUNK_OVERLAP = int(os.environ.get("CHUNK_OVERLAP", "64"))

#: Rough chars-per-token rule used only when tiktoken is unavailable.
CHARS_PER_TOKEN = 4

#: Batch size for embedding calls and DB inserts.
EMBEDDING_BATCH_SIZE = int(os.environ.get("EMBEDDING_BATCH_SIZE", "32"))

_HF_ENDPOINTS = (
    "https://router.huggingface.co/hf-inference/models/"
    + EMBEDDING_MODEL_NAME + "/pipeline/feature-extraction",
    "https://api-inference.huggingface.co/models/" + EMBEDDING_MODEL_NAME,
)

_local_model = None  # lazily-loaded sentence-transformers model (cached).

# ---------------------------------------------------------------------------
# Token counting
# ---------------------------------------------------------------------------

def _get_encoding():
    """Return a tiktoken encoding, or None when tiktoken is missing."""
    try:
        import tiktoken
        return tiktoken.get_encoding("cl100k_base")
    except Exception:
        return None


def count_tokens(text: str) -> int:
    """Count tokens in text (exact via tiktoken, else ~chars/4)."""
    if not text:
        return 0
    enc = _get_encoding()
    if enc is not None:
        return len(enc.encode(text))
    return max(1, math.ceil(len(text) / CHARS_PER_TOKEN))

# ---------------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------------

def _split_with_langchain(text, chunk_size, chunk_overlap):
    """Split via RecursiveCharacterTextSplitter (token-aware if possible)."""
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    enc = _get_encoding()
    if enc is not None:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=lambda s: len(enc.encode(s)),
            separators=["\n\n", "\n", " ", ""],
        )
    else:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size * CHARS_PER_TOKEN,
            chunk_overlap=chunk_overlap * CHARS_PER_TOKEN,
            length_function=len,
            separators=["\n\n", "\n", " ", ""],
        )
    return splitter.split_text(text)


def _split_sliding_window(text, chunk_size, chunk_overlap):
    """Pure-Python overlapping window fallback (no optional deps)."""
    approx_len = chunk_size * CHARS_PER_TOKEN
    approx_overlap = min(chunk_overlap * CHARS_PER_TOKEN, approx_len - 1)
    step = approx_len - approx_overlap
    chunks = []
    for start in range(0, len(text), step):
        piece = text[start:start + approx_len].strip()
        if piece:
            chunks.append(piece)
        if start + approx_len >= len(text):
            break
    return chunks

def chunk_text(text: str, chunk_size: int = 512, chunk_overlap: int = 64) -> list:
    """Split text into overlapping chunks of ~chunk_size tokens."""
    if chunk_size is None:
        chunk_size = DEFAULT_CHUNK_SIZE
    if chunk_overlap is None:
        chunk_overlap = DEFAULT_CHUNK_OVERLAP
    if not text or not text.strip():
        return []
    if chunk_size <= 0:
        raise ValueError("chunk_size must be a positive integer")
    chunk_overlap = max(0, min(chunk_overlap, chunk_size - 1))
    try:
        pieces = _split_with_langchain(text, chunk_size, chunk_overlap)
    except Exception as exc:
        logger.warning("RecursiveCharacterTextSplitter unavailable (%s); using fallback.", exc)
        pieces = _split_sliding_window(text, chunk_size, chunk_overlap)
    chunks = []
    cursor = 0
    for index, piece in enumerate(pieces):
        needle = piece.strip()
        if not needle:
            continue
        found = text.find(needle, cursor)
        if found == -1:
            found = cursor
        char_start, char_end = found, found + len(needle)
        token_start = count_tokens(text[:char_start])
        token_end = token_start + count_tokens(needle)
        chunks.append({"index": index, "text": needle, "token_start": token_start, "token_end": token_end, "char_start": char_start, "char_end": char_end})
        cursor = min(char_start + 1, len(text))
    for i, chunk in enumerate(chunks):
        chunk["index"] = i
    return chunks

# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

def _validate_vectors(vectors) -> list:
    cleaned = []
    for vec in vectors:
        row = [float(v) for v in vec]
        if len(row) != EMBEDDING_DIMENSIONS:
            raise ValueError(f"Expected {EMBEDDING_DIMENSIONS}-d embeddings, got {len(row)}-d.")
        cleaned.append(row)
    return cleaned


def _hf_token():
    return os.environ.get("HF_API_KEY") or os.environ.get("HUGGINGFACEHUB_API_TOKEN")


def _embed_via_hf_api(texts) -> list:
    import requests
    token = _hf_token()
    if not token:
        raise RuntimeError("HF API token not configured.")
    headers = {"Authorization": f"Bearer {token}"}
    last_error = None
    for url in _HF_ENDPOINTS:
        try:
            resp = requests.post(url, headers=headers, json={"inputs": texts, "options": {"wait_for_model": True}}, timeout=60)
            resp.raise_for_status()
            payload = resp.json()
            if payload and isinstance(payload[0], (int, float)):
                payload = [payload]
            return _validate_vectors(payload)
        except Exception as exc:
            last_error = exc
            logger.warning("HF endpoint %s failed: %s", url, exc)
    raise RuntimeError(f"All HF endpoints failed: {last_error}")


def _embed_via_local_model(texts) -> list:
    global _local_model
    from sentence_transformers import SentenceTransformer
    if _local_model is None:
        logger.info("Loading local embedding model %s on CPU.", EMBEDDING_MODEL_NAME)
        _local_model = SentenceTransformer(EMBEDDING_MODEL_NAME, device="cpu")
    vectors = _local_model.encode(texts, batch_size=EMBEDDING_BATCH_SIZE, show_progress_bar=False, normalize_embeddings=True, convert_to_numpy=True)
    return _validate_vectors(vectors.tolist())


def _embed_via_offline_fallback(texts) -> list:
    vectors = []
    for text in texts:
        values = []
        for i in range(EMBEDDING_DIMENSIONS):
            digest = hashlib.sha256(f"{text}::{i}".encode("utf-8")).digest()
            unit = int.from_bytes(digest[:4], "big") / 2 ** 32
            values.append(unit * 2.0 - 1.0)
        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        vectors.append([v / norm for v in values])
    return vectors


def generate_embeddings(texts: list) -> list:
    """Generate a 384-d embedding per input text (HF API -> local CPU -> offline fallback)."""
    if not texts:
        return []
    errors = []
    if _hf_token():
        try:
            return _embed_via_hf_api(texts)
        except Exception as exc:
            errors.append(f"hf-api: {exc}")
            logger.warning("HF Inference API failed (%s); trying local model.", exc)
    try:
        return _embed_via_local_model(texts)
    except Exception as exc:
        errors.append(f"local-model: {exc}")
        logger.warning("Local embedding model failed (%s); using offline fallback.", exc)
    logger.warning("Using deterministic offline embedding fallback (%s).", "; ".join(errors) or "no remote/local backend")
    return _embed_via_offline_fallback(texts)

# ---------------------------------------------------------------------------
# Database integration (Django imports kept lazy)
# ---------------------------------------------------------------------------

def _get_message_model():
    from django.apps import apps
    return apps.get_model("orbitbackend", "Message")


def _get_chunk_model():
    from django.apps import apps
    return apps.get_model("orbitbackend", "Chunk")


def ingest_message_chunks(message=None, message_id=None, text=None, chunk_size=512, chunk_overlap=64, batch_size=32, replace_existing=True):
    """Chunk + embed text and persist rows to the chunks table."""
    Message = _get_message_model()
    Chunk = _get_chunk_model()
    if chunk_size is None:
        chunk_size = DEFAULT_CHUNK_SIZE
    if chunk_overlap is None:
        chunk_overlap = DEFAULT_CHUNK_OVERLAP
    if batch_size is None:
        batch_size = EMBEDDING_BATCH_SIZE
    if message is None:
        if message_id is None:
            raise ValueError("Provide either message or message_id.")
        message = Message.objects.get(pk=message_id)
    raw = text if text is not None else message.raw_text
    if not raw or not raw.strip():
        logger.info("Message %s has no text; nothing to ingest.", message.pk)
        return []
    pieces = chunk_text(raw, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    if not pieces:
        return []
    if replace_existing:
        Chunk.objects.filter(message=message).delete()
    created = []
    for start in range(0, len(pieces), batch_size):
        batch = pieces[start:start + batch_size]
        vectors = generate_embeddings([p["text"] for p in batch])
        rows = [Chunk(message=message, text=piece["text"], embedding=vector, token_start=piece["token_start"], token_end=piece["token_end"]) for piece, vector in zip(batch, vectors)]
        created.extend(Chunk.objects.bulk_create(rows))
    logger.info("Ingested %d chunks for message %s.", len(created), message.pk)
    return created


def ingest_text_for_message(message_id, text: str, **kwargs):
    """Convenience wrapper: ingest arbitrary (document) text for a message."""
    return ingest_message_chunks(message_id=message_id, text=text, **kwargs)


def _self_test() -> None:
    sample = ("Orbit Sentinel ingests WhatsApp messages, meeting transcripts and PDFs. " * 40).strip()
    chunks = chunk_text(sample)
    assert chunks, "chunk_text returned no chunks"
    assert all(c["token_end"] > c["token_start"] for c in chunks)
    assert all(c["char_end"] > c["char_start"] for c in chunks)
    assert chunks[0]["char_start"] == 0
    probe = [c["text"] for c in chunks[:3]] + [""]
    vecs = generate_embeddings(probe)
    assert len(vecs) == len(probe) and all(len(v) == EMBEDDING_DIMENSIONS for v in vecs)
    assert chunk_text("") == [] and generate_embeddings([]) == []
    # Message PK audit: Message uses message_id (BigAutoField PK), never `id`.
    from orbit_app.messages.models import Message as _Message
    assert _Message._meta.pk.name == "message_id", _Message._meta.pk.name
    print(f"chunk_text: {len(chunks)} chunks OK; token range [{chunks[0]['token_start']}, {chunks[-1]['token_end']}); generate_embeddings: {len(vecs)} x {len(vecs[0])} OK; Message PK=message_id OK")


def _bootstrap_django_for_self_test():
    """Best-effort django.setup() for standalone self-tests.

    Offline-safe: warns and continues when settings/DB are unreachable so
    pure-function self-tests still pass without PostgreSQL.
    """
    import os
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "orbit_app.settings")
    try:
        import django
        from django.conf import settings as _settings
        if not _settings.configured:
            pass
        django.setup()
    except Exception as exc:
        logger.warning("django.setup() skipped for self-test (%s).", exc)


if __name__ == "__main__":
    import sys
    if "--self-test" in sys.argv:
        _bootstrap_django_for_self_test()
        _self_test()
    else:
        print(__doc__)
