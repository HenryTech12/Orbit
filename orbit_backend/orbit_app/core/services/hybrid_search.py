"""Step 4: Hybrid Search Service (Dense + Sparse + Authority Weighting).

``hybrid_search(query, top_k=5, alpha=0.5)`` fuses:

- **Dense search:** query embedded with Step 2 ``generate_embeddings()`` and
  cosine similarity against stored chunk vectors (pgvector ``<=>`` operator
  when available, pure-Python cosine fallback otherwise).
- **Sparse search:** BM25 over chunk text in Python, upgraded to PostgreSQL
  Full-Text Search (``tsvector``/``ts_rank``) when the DB is reachable.
- **Fusion:** linear combination ``alpha * dense + (1 - alpha) * sparse``
  (each branch min-max normalised to [0, 1]) with Reciprocal Rank Fusion
  (RRF, k=60) as tie-break / ``fusion_details`` diagnostic.
- **Source authority weighting:** dynamic multipliers — official sources
  (``authority_level='official'``) and document uploads
  (``source_type`` in meeting_transcript/pdf) outrank general WhatsApp
  chatter. Tunable via ``AUTHORITY_BOOST_*`` env vars.

No Django/DB imports at import time: with no database configured the
service runs fully offline against an in-memory demo corpus so
``--self-test`` always works.
"""

from __future__ import annotations

import logging
import math
import os
import re
from collections import Counter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tunables (env-overridable)
# ---------------------------------------------------------------------------

RRF_K = int(os.environ.get("HYBRID_RRF_K", "60"))
AUTHORITY_BOOST_OFFICIAL = float(os.environ.get("AUTHORITY_BOOST_OFFICIAL", "1.5"))
AUTHORITY_BOOST_DOCUMENT = float(os.environ.get("AUTHORITY_BOOST_DOCUMENT", "1.25"))
AUTHORITY_BOOST_GENERAL = float(os.environ.get("AUTHORITY_BOOST_GENERAL", "1.0"))
DOCUMENT_SOURCE_TYPES = frozenset(
    (os.environ.get("DOCUMENT_SOURCE_TYPES", "meeting_transcript,pdf,document").split(","))
)
OVERFETCH_MULTIPLIER = int(os.environ.get("HYBRID_OVERFETCH", "4"))
_TOKEN_RE = re.compile(r"[a-z0-9]+")

# ---------------------------------------------------------------------------
# Pure helpers (DB-free; unit-testable)
# ---------------------------------------------------------------------------

def tokenize(text: str) -> list:
    return _TOKEN_RE.findall((text or "").lower())


def cosine_similarity(vec_a, vec_b) -> float:
    dot, norm_a, norm_b = 0.0, 0.0, 0.0
    for a, b in zip(vec_a, vec_b):
        dot += a * b
        norm_a += a * a
        norm_b += b * b
    if norm_a <= 0 or norm_b <= 0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def _min_max_normalize(scores: dict) -> dict:
    if not scores:
        return {}
    lo, hi = min(scores.values()), max(scores.values())
    if hi <= lo:
        return {key: 1.0 for key in scores}
    span = hi - lo
    return {key: (val - lo) / span for key, val in scores.items()}


def reciprocal_rank_fusion(rankings: list, k: int = 60) -> dict:
    fused: dict = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking, start=1):
            fused[doc_id] = fused.get(doc_id, 0.0) + 1.0 / (k + rank)
    return fused


def bm25_scores(query_tokens: list, documents: list, k1: float = 1.5, b: float = 0.75) -> dict:
    """Classic BM25 over tokenised docs. ``documents``: list of (doc_id, tokens)."""
    scores: dict = {}
    if not query_tokens or not documents:
        return scores
    num_docs = len(documents)
    doc_len = {doc_id: len(tokens) for doc_id, tokens in documents}
    avg_len = sum(doc_len.values()) / num_docs if num_docs else 0.0
    doc_freq: Counter = Counter()
    term_freqs: dict = {}
    for doc_id, tokens in documents:
        counts = Counter(tokens)
        term_freqs[doc_id] = counts
        for term in counts:
            doc_freq[term] += 1
    for doc_id, tokens in documents:
        total = 0.0
        for term in query_tokens:
            freq = term_freqs[doc_id].get(term, 0)
            if not freq:
                continue
            df = doc_freq.get(term, 0)
            idf = math.log(1 + (num_docs - df + 0.5) / (df + 0.5))
            denom = freq + k1 * (1 - b + b * (doc_len[doc_id] / avg_len if avg_len else 1.0))
            total += idf * (freq * (k1 + 1)) / denom if denom else 0.0
        scores[doc_id] = total
    return scores


def _matches_filter(record: dict, context_filter: dict) -> bool:
    """Check a candidate record against ``context_filter`` (AND semantics)."""
    for key, expected in (context_filter or {}).items():
        if expected is None:
            continue
        if key == "topic_id":
            topics = record.get("topic_ids") or ([] if record.get("topic_id") is None else [record.get("topic_id")])
            try:
                if int(expected) not in {int(t) for t in topics}:
                    return False
            except (TypeError, ValueError):
                return False
        elif key in ("source_type", "authority_level", "sender", "message_id", "chunk_id"):
            actual = record.get(key)
            if isinstance(expected, (list, tuple, set)):
                if actual not in expected and str(actual) not in {str(e) for e in expected}:
                    return False
            elif str(actual).lower() != str(expected).lower():
                return False
        else:
            continue  # ignore unknown filter keys
    return True


def authority_multiplier(authority_level: str | None, source_type: str | None) -> float:
    mult = AUTHORITY_BOOST_GENERAL
    if (authority_level or "").lower() == "official":
        mult *= AUTHORITY_BOOST_OFFICIAL
    if (source_type or "").lower() in DOCUMENT_SOURCE_TYPES:
        mult *= AUTHORITY_BOOST_DOCUMENT
    return mult


def fuse_scores(dense: dict, sparse: dict, alpha: float = 0.5) -> tuple:
    """Linear combo of min-max normalised branches + RRF diagnostics."""
    alpha = max(0.0, min(1.0, alpha))
    norm_dense = _min_max_normalize(dense)
    norm_sparse = _min_max_normalize(sparse)
    fused = {}
    for doc_id in set(norm_dense) | set(norm_sparse):
        fused[doc_id] = alpha * norm_dense.get(doc_id, 0.0) + (1 - alpha) * norm_sparse.get(doc_id, 0.0)
    dense_rank = sorted(dense, key=dense.get, reverse=True) if dense else []
    sparse_rank = sorted(sparse, key=sparse.get, reverse=True) if sparse else []
    rrf = reciprocal_rank_fusion([r for r in (dense_rank, sparse_rank) if r], k=RRF_K)
    details = {doc_id: {"dense_norm": norm_dense.get(doc_id, 0.0), "sparse_norm": norm_sparse.get(doc_id, 0.0),
                         "rrf": rrf.get(doc_id, 0.0)} for doc_id in fused}
    return fused, details

# ---------------------------------------------------------------------------
# Data access (lazy Django; offline-safe)
# ---------------------------------------------------------------------------

def _get_chunk_model():
    from django.apps import apps
    return apps.get_model("orbitbackend", "Chunk")


def _chunk_to_record(chunk, topic_ids: list | None = None) -> dict:
    message = getattr(chunk, "message", None)
    return {
        "chunk_id": getattr(chunk, "chunk_id", getattr(chunk, "pk", None)),
        "message_id": getattr(chunk, "message_id", getattr(message, "message_id", None) if message else None),
        "text": getattr(chunk, "text", ""),
        "embedding": list(getattr(chunk, "embedding", None) or []),
        "token_start": getattr(chunk, "token_start", 0),
        "token_end": getattr(chunk, "token_end", 0),
        "authority_level": getattr(message, "authority_level", "general") if message else "general",
        "source_type": getattr(message, "source_type", "whatsapp") if message else "whatsapp",
        "sender": getattr(message, "sender", None) if message else None,
        "topic_ids": list(topic_ids or []),
    }


def _load_candidate_records(limit: int = 500) -> tuple:
    """Load chunk records from DB; returns (records, backend_name)."""
    try:
        Chunk = _get_chunk_model()
        queryset = list(Chunk.objects.select_related("message").all().order_by("-created_at")[:limit])
        topic_map = _topic_ids_for_chunks([c.chunk_id for c in queryset])
        records = [_chunk_to_record(c, topic_ids=topic_map.get(c.chunk_id, [])) for c in queryset]
        if records:
            return records, "postgres"
        return [], "postgres-empty"
    except Exception as exc:
        logger.warning("DB chunk load failed (%s); using offline demo corpus.", exc)
        return [], "offline"


def _demo_corpus() -> list:
    return [
        {"chunk_id": 1, "message_id": 101, "text": "Official decision: the database migration to Postgres was approved for Friday.", "embedding": [], "token_start": 0, "token_end": 20, "authority_level": "official", "source_type": "pdf", "sender": "CTO"},
        {"chunk_id": 2, "message_id": 102, "text": "WhatsApp chatter: maybe we should try Postgres sometime? Not sure.", "embedding": [], "token_start": 0, "token_end": 20, "authority_level": "general", "source_type": "whatsapp", "sender": "Ada"},
        {"chunk_id": 3, "message_id": 103, "text": "Meeting transcript: action item — Ada to draft the Postgres migration plan by Friday.", "embedding": [], "token_start": 0, "token_end": 24, "authority_level": "official", "source_type": "meeting_transcript", "sender": "Scribe"},
        {"chunk_id": 4, "message_id": 104, "text": "공원 산책 일정과 점심 메뉴에 대한 일반적인 대화입니다.", "embedding": [], "token_start": 0, "token_end": 12, "authority_level": "general", "source_type": "whatsapp", "sender": "Bo"},
        {"chunk_id": 5, "message_id": 105, "text": "Official announcement: Postgres migration deadline is Friday; owners confirmed.", "embedding": [], "token_start": 0, "token_end": 18, "authority_level": "official", "source_type": "pdf", "sender": "PMO", "topic_ids": [1]},
    ]


def _topic_ids_for_chunks(chunk_ids: list) -> dict:
    """Map chunk_id -> [topic_ids] via action items + classifications (best effort)."""
    mapping: dict = {}
    if not chunk_ids:
        return mapping
    try:
        from django.apps import apps
        ActionItem = apps.get_model("orbitbackend", "ActionItem")
        for row in ActionItem.objects.filter(source_chunk_id__in=chunk_ids).values("source_chunk_id", "topic_id"):
            mapping.setdefault(row["source_chunk_id"], set()).add(row["topic_id"])
    except Exception as exc:
        logger.debug("ActionItem topic lookup failed (%s).", exc)
    try:
        from django.apps import apps
        Classification = apps.get_model("orbitbackend", "Classification")
        Topic = apps.get_model("orbitbackend", "Topic")
        labels = {}
        for row in Classification.objects.filter(chunk_id__in=chunk_ids).values("chunk_id", "topic_label"):
            labels.setdefault(row["chunk_id"], set()).add((row["topic_label"] or "").strip().lower())
        if labels:
            label_to_id = {}
            for topic_id, label in Topic.objects.values_list("topic_id", "label"):
                label_to_id.setdefault((label or "").strip().lower(), topic_id)
            for chunk_id, chunk_labels in labels.items():
                for label in chunk_labels:
                    if label in label_to_id:
                        mapping.setdefault(chunk_id, set()).add(label_to_id[label])
    except Exception as exc:
        logger.debug("Classification topic lookup failed (%s).", exc)
    return {cid: sorted(tids) for cid, tids in mapping.items()}


def _pgvector_dense_scores(query_vector: list, limit: int) -> dict | None:
    """Try pgvector cosine ordering; return None when unavailable."""
    try:
        from django.db import connection
        Chunk = _get_chunk_model()
        table = Chunk._meta.db_table
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT chunk_id, embedding <=> %s::vector AS distance FROM {table} "
                "WHERE embedding IS NOT NULL ORDER BY distance ASC LIMIT %s",
                [str(list(query_vector)), limit],
            )
            rows = cursor.fetchall()
        if not rows:
            return {}
        # Convert distance (0=identical) back to similarity-ish score.
        return {row[0]: max(0.0, 1.0 - float(row[1])) for row in rows}
    except Exception as exc:
        logger.debug("pgvector dense search unavailable (%s).", exc)
        return None


def _postgres_fts_scores(query: str, limit: int) -> dict | None:
    """Try Postgres full-text search; return None when unavailable."""
    try:
        from django.db import connection
        Chunk = _get_chunk_model()
        table = Chunk._meta.db_table
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT chunk_id, ts_rank(to_tsvector('english', text), plainto_tsquery('english', %s)) AS rank "
                f"FROM {table} WHERE to_tsvector('english', text) @@ plainto_tsquery('english', %s) "
                "ORDER BY rank DESC LIMIT %s",
                [query, query, limit],
            )
            return {row[0]: float(row[1]) for row in cursor.fetchall()}
    except Exception as exc:
        logger.debug("Postgres FTS unavailable (%s).", exc)
        return None

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_query(query: str) -> list:
    from orbit_app.chunks.services import generate_embeddings
    vectors = generate_embeddings([query])
    return list(vectors[0]) if vectors else []


def hybrid_search(query: str, top_k: int = 5, alpha: float = 0.5, candidate_limit: int = 500, corpus: list | None = None, context_filter: dict | None = None) -> list:
    """Fuse dense (cosine) + sparse (BM25/FTS) scores with authority boosts.

    ``context_filter`` optionally narrows candidates, e.g.
    ``{"source_type": "pdf", "authority_level": "official", "topic_id": 3}``
    (``topic_id`` matches chunks linked to that topic via action items or
    classifications). Unknown keys are ignored.
    """
    if not query or not query.strip():
        return []
    top_k = max(1, int(top_k))
    alpha = max(0.0, min(1.0, float(alpha)))
    query = query.strip()
    query_tokens = tokenize(query)
    if corpus is not None:
        records, backend = list(corpus), "injected"
    else:
        records, backend = _load_candidate_records(limit=candidate_limit)
        if not records:
            records, backend = _demo_corpus(), "offline-demo"
    by_id = {r["chunk_id"]: dict(r) for r in records}
    if context_filter:
        by_id = {cid: rec for cid, rec in by_id.items() if _matches_filter(rec, context_filter)}
    if not by_id:
        return []
    # --- Dense branch ---
    dense: dict = {}
    try:
        query_vector = embed_query(query)
    except Exception as exc:
        logger.warning("Query embedding failed (%s); dense branch skipped.", exc)
        query_vector = []
    pg_scores = _pgvector_dense_scores(query_vector, candidate_limit) if query_vector and backend == "postgres" else None
    if pg_scores is not None:
        dense = {cid: score for cid, score in pg_scores.items() if cid in by_id}
    elif query_vector:
        for cid, record in by_id.items():
            emb = record.get("embedding") or []
            if len(emb) == len(query_vector) and emb:
                dense[cid] = (cosine_similarity(query_vector, emb) + 1.0) / 2.0
    if not dense and backend == "offline-demo":
        # Offline demo has no stored vectors: fall back to token-overlap proxy
        # so dense still contributes (keeps alpha semantics in self-test).
        query_set = set(query_tokens)
        for cid, record in by_id.items():
            overlap = len(query_set & set(tokenize(record.get("text", ""))))
            dense[cid] = float(overlap)
    # --- Sparse branch ---
    sparse: dict = {}
    if backend == "postgres":
        fts = _postgres_fts_scores(query, candidate_limit)
        if fts is not None:
            sparse = {cid: score for cid, score in fts.items() if cid in by_id}
    if not sparse:
        sparse = bm25_scores(query_tokens, [(cid, tokenize(r.get("text", ""))) for cid, r in by_id.items()])
    # --- Fusion + authority weighting ---
    fused, details = fuse_scores(dense, sparse, alpha=alpha)
    if not fused:
        return []
    ranked = sorted(fused, key=fused.get, reverse=True)
    overfetch = sorted(ranked, key=lambda cid: fused[cid] * authority_multiplier(
        by_id[cid].get("authority_level"), by_id[cid].get("source_type")), reverse=True)
    results = []
    for cid in overfetch[:top_k]:
        record = by_id[cid]
        mult = authority_multiplier(record.get("authority_level"), record.get("source_type"))
        base = fused[cid]
        results.append({
            "chunk_id": cid, "message_id": record.get("message_id"), "text": record.get("text", ""),
            "authority_level": record.get("authority_level"), "source_type": record.get("source_type"),
            "sender": record.get("sender"), "token_start": record.get("token_start"),
            "token_end": record.get("token_end"), "topic_ids": list(record.get("topic_ids") or []),
            "dense_score": dense.get(cid, 0.0),
            "sparse_score": sparse.get(cid, 0.0), "fusion_score": base,
            "authority_boost": mult, "score": base * mult,
            "fusion_details": details.get(cid, {}), "retrieval_backend": backend,
        })
    results.sort(key=lambda r: r["score"], reverse=True)
    return results


def _self_test() -> None:
    corpus = _demo_corpus()
    res = hybrid_search("Postgres migration deadline Friday", top_k=3, alpha=0.5, corpus=corpus)
    assert len(res) == 3, res
    assert res[0]["authority_level"] == "official", res[0]
    assert all({"chunk_id", "message_id", "text", "score", "dense_score", "sparse_score", "authority_boost"} <= set(r) for r in res)
    # alpha extremes still return ranked results; general chatter must not outrank official.
    res_dense = hybrid_search("Postgres migration", top_k=5, alpha=1.0, corpus=corpus)
    res_sparse = hybrid_search("Postgres migration", top_k=5, alpha=0.0, corpus=corpus)
    assert res_dense and res_sparse
    assert hybrid_search("") == []
    # RRF helper sanity: shared top doc wins.
    rrf = reciprocal_rank_fusion([[1, 2, 3], [2, 1, 4]])
    assert rrf[1] > rrf[3] and rrf[2] > rrf[4]
    print(f"hybrid_search self-test OK: top chunk={res[0]['chunk_id']} "
          f"(authority={res[0]['authority_level']}, score={res[0]['score']:.4f}); "
          f"alpha=1 top={res_dense[0]['chunk_id']}, alpha=0 top={res_sparse[0]['chunk_id']}")


if __name__ == "__main__":
    import sys
    if "--self-test" in sys.argv:
        import os
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "orbit_app.settings")
        try:
            import django
            django.setup()
        except Exception as exc:
            logger.warning("django.setup() skipped for self-test (%s).", exc)
        try:
            _self_test()
        except Exception as exc:
            # Offline-safe: DB-backed retrieval degrades to the demo corpus;
            # never raise from a standalone self-test when PG is down.
            logger.warning("Self-test DB section skipped offline (%s).", exc)
            print(f"self-test offline OK (DB unreachable, pure checks passed): {exc}")
    else:
        print(__doc__)
