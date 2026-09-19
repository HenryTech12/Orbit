from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import VectorSearchRequest, VectorSearchResponse, VectorSearchResult
from app.services.embeddings import get_embedding_backend
from app.services.vector_store import get_vector_store

router = APIRouter(prefix="/vectors", tags=["vectors"])


@router.post("/search", response_model=VectorSearchResponse)
def search(payload: VectorSearchRequest, db: Session = Depends(get_db)):
    """Nearest-neighbor search over stored transcript chunks. This is
    the storage/indexing infrastructure Henry owns (PRD: "pgvector
    storage + HNSW indexing"); full hybrid (vector + BM25) retrieval and
    grounded generation on top of this is Kamate/Mamadou's Responder."""
    embedder = get_embedding_backend()
    query_embedding = embedder.embed(payload.query)

    store = get_vector_store()
    matches = store.search(db, query_embedding, top_k=payload.top_k)

    results = [
        VectorSearchResult(chunk_id=chunk.id, meeting_id=chunk.meeting_id, text=chunk.text, score=score)
        for chunk, score in matches
    ]
    return VectorSearchResponse(results=results)
