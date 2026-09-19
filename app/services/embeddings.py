"""
Chunking + embedding (PRD Section 5.1 "Knowledge Processing Layer").

The stub embedding backend is a deterministic hash-based pseudo-embedding:
it has no semantic meaning, but it is stable (the same text always
produces the same vector) and cheap, so unit tests can exercise the
full storage/search pipeline without needing model weights or an API
key. Swap EMBEDDING_BACKEND=openai (or plug in bge-small-en locally) for
real semantic search in the actual deployment.
"""
import hashlib
import math
from abc import ABC, abstractmethod
from typing import List

from app.config import settings


class EmbeddingBackend(ABC):
    @abstractmethod
    def embed(self, text: str) -> List[float]:
        raise NotImplementedError


class StubEmbeddingBackend(EmbeddingBackend):
    def embed(self, text: str) -> List[float]:
        dim = settings.EMBEDDING_DIM
        vec = [0.0] * dim
        # Deterministically spread hashed token features across the vector
        # so semantically-similar stub inputs (sharing words) end up
        # closer together than unrelated ones - good enough for tests that
        # check "the closest chunk to a query is the one sharing its
        # words", without needing a real model.
        for token in text.lower().split():
            h = int(hashlib.sha256(token.encode()).hexdigest(), 16)
            idx = h % dim
            vec[idx] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


class OpenAIEmbeddingBackend(EmbeddingBackend):
    def embed(self, text: str) -> List[float]:
        import openai

        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        result = client.embeddings.create(model="text-embedding-3-small", input=text)
        return result.data[0].embedding


def get_embedding_backend() -> EmbeddingBackend:
    if settings.EMBEDDING_BACKEND == "openai":
        return OpenAIEmbeddingBackend()
    return StubEmbeddingBackend()


def chunk_text(text: str, max_words: int = 80, overlap_words: int = 15) -> List[str]:
    """Simple overlapping word-window chunker.

    The PRD specifies 512-token overlapping windows for production; this
    word-based version is a lightweight stand-in that's dependency-free
    and easy to unit test, while preserving the same "overlapping windows"
    behavior.
    """
    words = text.split()
    if not words:
        return []
    if len(words) <= max_words:
        return [text.strip()]

    chunks = []
    start = 0
    step = max(1, max_words - overlap_words)
    while start < len(words):
        window = words[start:start + max_words]
        chunks.append(" ".join(window))
        if start + max_words >= len(words):
            break
        start += step
    return chunks
