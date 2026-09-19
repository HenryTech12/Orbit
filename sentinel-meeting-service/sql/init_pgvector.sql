-- Production schema addition for Postgres + pgvector (PRD Section 5.1 /
-- 6: "pgvector storage + HNSW indexing"). Not used by the SQLite/test
-- path (see app/services/vector_store.py) - apply this once DATABASE_URL
-- points at a real Postgres instance, then flip USE_PGVECTOR on by using
-- a postgresql:// DATABASE_URL.

CREATE EXTENSION IF NOT EXISTS vector;

-- A dedicated table for the vector column + HNSW index, kept separate
-- from the app's transcript_chunks table (created by SQLAlchemy) so the
-- two can be joined by id without SQLAlchemy needing to understand the
-- pgvector type directly.
CREATE TABLE IF NOT EXISTS transcript_chunks_vec (
    id UUID PRIMARY KEY REFERENCES transcript_chunks(id) ON DELETE CASCADE,
    embedding vector(384) NOT NULL  -- matches EMBEDDING_DIM in app/config.py
);

-- HNSW index for fast approximate nearest-neighbor search, as specified
-- in the PRD's Knowledge Processing Layer.
CREATE INDEX IF NOT EXISTS transcript_chunks_vec_hnsw_idx
    ON transcript_chunks_vec
    USING hnsw (embedding vector_cosine_ops);
