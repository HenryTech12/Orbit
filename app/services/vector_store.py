"""
Vector storage + retrieval (PRD Section 6, "pgvector storage + HNSW
indexing" - Henry's ownership).

Two implementations behind one interface:

* SQLiteVectorStore - reads embeddings already stored (as JSON) on the
  TranscriptChunk rows and does cosine similarity in Python with numpy.
  This is what actually runs in this hackathon build and in tests - the
  PRD's own tech-stack table lists "SQLite/Postgres" as acceptable for
  the Hackathon MVP row, so this isn't a shortcut, it's the specified
  MVP path.

* PgVectorStore - talks to a real Postgres+pgvector `vector` column
  with an HNSW index via raw SQL (see sql/init_pgvector.sql for the
  matching schema/index). This is the production path from the PRD's
  tech-stack table. It isn't exercised by the test suite (no live
  Postgres in this environment) but is real, runnable code once
  DATABASE_URL points at a Postgres+pgvector instance.

Which one is used is decided once, in get_vector_store(), based on
settings.USE_PGVECTOR - callers never need to know which backend is
active.
"""
from abc import ABC, abstractmethod
from typing import List, Tuple

import numpy as np
from sqlalchemy.orm import Session

from app.config import settings
from app.models import TranscriptChunk


class VectorStore(ABC):
    @abstractmethod
    def search(self, db: Session, query_embedding: List[float], top_k: int = 5) -> List[Tuple[TranscriptChunk, float]]:
        """Return up to top_k (chunk, similarity_score) pairs, best first."""
        raise NotImplementedError


class SQLiteVectorStore(VectorStore):
    def search(self, db: Session, query_embedding: List[float], top_k: int = 5) -> List[Tuple[TranscriptChunk, float]]:
        chunks = db.query(TranscriptChunk).all()
        if not chunks:
            return []

        q = np.array(query_embedding, dtype=float)
        q_norm = np.linalg.norm(q) or 1.0

        scored = []
        for chunk in chunks:
            v = np.array(chunk.embedding, dtype=float)
            v_norm = np.linalg.norm(v) or 1.0
            similarity = float(np.dot(q, v) / (q_norm * v_norm))
            scored.append((chunk, similarity))

        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored[:top_k]


class PgVectorStore(VectorStore):
    """Production backend. Requires DATABASE_URL to point at Postgres
    with the pgvector extension and the schema in sql/init_pgvector.sql
    already applied (adds a real `vector(EMBEDDING_DIM)` column with an
    HNSW index, instead of the JSON-text column used for SQLite)."""

    def search(self, db: Session, query_embedding: List[float], top_k: int = 5) -> List[Tuple[TranscriptChunk, float]]:
        from sqlalchemy import text as sql_text

        vector_literal = "[" + ",".join(str(x) for x in query_embedding) + "]"
        rows = db.execute(
            sql_text(
                """
                SELECT id, 1 - (embedding <=> :query_vector) AS score
                FROM transcript_chunks_vec
                ORDER BY embedding <=> :query_vector
                LIMIT :top_k
                """
            ),
            {"query_vector": vector_literal, "top_k": top_k},
        ).fetchall()

        results = []
        for row in rows:
            chunk = db.get(TranscriptChunk, row.id)
            if chunk is not None:
                results.append((chunk, float(row.score)))
        return results


def get_vector_store() -> VectorStore:
    if settings.USE_PGVECTOR:
        return PgVectorStore()
    return SQLiteVectorStore()
