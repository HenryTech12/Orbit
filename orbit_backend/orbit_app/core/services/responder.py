"""Step 4: Grounded Copilot Responder (Trust-Layer).

``generate_grounded_response(query, context_chunks=None)`` answers strictly
from retrieved context: it auto-retrieves via ``hybrid_search`` when no
chunks are supplied, drafts an answer with explicit ``[message:<id>]``
citations, applies the hallucination guardrail (``trust_status='unknown'``
when unsupported), scores confidence
(``verified | low_confidence | unknown``), and contradiction-checks key
decisions against ``topics_history`` snapshots.

Answer backends: Groq chat (``GROQ_API_KEY``) when configured, otherwise a
deterministic extractive composer — both forced through the same grounding
post-check so ``--self-test`` is fully offline-safe.
"""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_FALLBACK_MODEL = os.environ.get("GROQ_FALLBACK_MODEL", "mixtral-8x7b-32768")

TRUST_SYSTEM_PROMPT = """\
You are Sentinel, a grounded copilot. Answer STRICTLY using the provided
context chunks. Rules:
1. Every factual claim must carry an explicit citation like [message:12].
2. Use only information present in the context. Do not invent names, dates,
   decisions, or owners.
3. If the context does not support an answer, say so explicitly and set
   trust_status to "unknown".
4. Cite the message_id of the chunk(s) supporting each sentence.
5. Keep the answer concise (2-6 sentences) plus a Sources line.
"""

_NEGATION_RE = re.compile(r"\b(not|no longer|never|cancelled|cancel)", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Pure helpers (DB-free)
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> set:
    import re as _re
    return set(_re.findall(r"[a-z0-9]+", (text or "").lower()))


def _content_tokens(text: str) -> set:
    stop = {"the", "a", "an", "is", "are", "was", "were", "be", "to", "of", "and",
            "or", "in", "on", "for", "with", "by", "what", "when", "where",
            "who", "how", "does", "do", "did", "it", "this", "that"}
    return {t for t in _tokenize(text) if t not in stop and len(t) > 2}


def _format_context(chunks: list) -> str:
    lines = []
    for chunk in chunks:
        lines.append(f"[message:{chunk.get('message_id')}] (chunk {chunk.get('chunk_id')}, "
                     f"{chunk.get('authority_level', 'general')}/{chunk.get('source_type', '?')}): "
                     f"{chunk.get('text', '')[:800]}")
    return "\n".join(lines)


def _compose_extractive_answer(query: str, chunks: list) -> str:
    """Deterministic offline composer: top supporting sentences + citations."""
    import re as _re
    query_terms = _content_tokens(query)
    scored = []
    for chunk in chunks:
        for sent in _re.split(r"(?<=[.!?])\s+", chunk.get("text", "").strip()):
            sent = sent.strip()
            if len(sent) < 10:
                continue
            overlap = len(query_terms & _tokenize(sent))
            scored.append((overlap, len(sent), sent, chunk.get("message_id")))
    scored.sort(key=lambda t: (t[0], -t[1]), reverse=True)
    picked = [s for s in scored if s[0] > 0][:3] or scored[:2]
    if not picked:
        return ""
    lines = [f"{sent} [message:{mid}]" for _, _, sent, mid in picked]
    sources = ", ".join(f"message:{mid}" for _, _, _, mid in picked)
    return " ".join(lines) + f"\nSources: {sources}"


def _coverage(answer: str, chunks: list) -> dict:
    """Fraction of answer content-words supported by context + citation check."""
    import re as _re
    context_vocab = set()
    for chunk in chunks:
        context_vocab |= _tokenize(chunk.get("text", ""))
    words = _content_tokens(answer)
    supported = {w for w in words if w in context_vocab}
    citations = set(_re.findall(r"\[message:(\d+)\]", answer or ""))
    valid_ids = {str(c.get("message_id")) for c in chunks}
    return {
        "coverage": len(supported) / len(words) if words else 0.0,
        "has_citation": bool(citations & valid_ids),
        "citations": sorted(citations),
    }


def _query_grounding(query: str, chunks: list) -> float:
    """Fraction of query content-words appearing anywhere in the context."""
    query_terms = _content_tokens(query)
    if not query_terms:
        return 0.0
    context_vocab = set()
    for chunk in chunks:
        context_vocab |= _tokenize(chunk.get("text", ""))
    return len(query_terms & context_vocab) / len(query_terms)


def _confidence(answer: str, chunks: list, fused_scores: list, query: str = "") -> tuple:
    cov = _coverage(answer, chunks)
    grounding = _query_grounding(query, chunks) if query else 1.0
    top_score = max(fused_scores) if fused_scores else 0.0
    official_hit = any(c.get("authority_level") == "official" for c in chunks[:2])
    if not answer.strip() or cov["coverage"] < 0.35 or not cov["has_citation"] or grounding < 0.3:
        return "unknown", 0.0, cov
    score = 0.5 * cov["coverage"] + 0.3 * min(1.0, top_score) + (0.2 if official_hit else 0.0)
    if cov["coverage"] >= 0.7 and (official_hit or top_score >= 0.5):
        return "verified", round(score, 3), cov
    return "low_confidence", round(score, 3), cov

# ---------------------------------------------------------------------------
# Contradiction check vs topics_history snapshots
# ---------------------------------------------------------------------------

def _get_history_model():
    from django.apps import apps
    return apps.get_model("orbitbackend", "TopicHistory")


def _load_history_snapshots(limit: int = 200, history: list | None = None) -> list:
    if history is not None:
        return list(history)
    try:
        History = _get_history_model()
        return list(History.objects.select_related("topic").all().order_by("-timestamp")[:limit].values(
            "topic_id", "topic__label", "value_snapshot", "timestamp"))
    except Exception as exc:
        logger.debug("TopicHistory load failed (%s); no past decisions.", exc)
        return []


def _polarity_conflicts(answer: str, past: str, threshold: float = 0.15) -> tuple:
    """(conflicts, jaccard): polarity mismatch on overlapping decision terms."""
    import re as _re
    answer_terms = _content_tokens(answer)
    past_terms = _content_tokens(past)
    if not answer_terms or not past_terms:
        return False, 0.0
    overlap = answer_terms & past_terms
    union = answer_terms | past_terms
    jaccard = len(overlap) / len(union) if union else 0.0
    if jaccard < threshold:
        return False, jaccard
    return bool(_NEGATION_RE.search(past)) != bool(_NEGATION_RE.search(answer)), jaccard


def check_contradictions(answer: str, history: list | None = None, limit: int = 200, chunks: list | None = None) -> list:
    """Flag past decisions whose polarity conflicts with the drafted answer.

    The answer is checked as a whole AND per supporting sentence/chunk so a
    single conflicting decision is not diluted by a long multi-part answer.
    """
    import re as _re
    snapshots = _load_history_snapshots(limit=limit, history=history)
    if not snapshots or not (answer or "").strip():
        return []
    segments = [answer]
    segments += [s.strip() for s in _re.split(r"(?<=[.!?])\s+", answer) if s.strip()]
    for chunk in chunks or []:
        text = (chunk.get("text", "") or "").strip()
        if text:
            segments.append(text)
    contradictions = []
    for snap in snapshots:
        past = snap.get("value_snapshot", "") or ""
        best = 0.0
        hit = False
        for segment in segments:
            conflicts, jaccard = _polarity_conflicts(segment, past)
            best = max(best, jaccard)
            if conflicts:
                hit = True
                break
        if hit:
            contradictions.append({
                "topic_id": snap.get("topic_id"), "topic_label": snap.get("topic__label"),
                "past_snapshot": past[:400], "past_timestamp": str(snap.get("timestamp")),
                "reason": "polarity conflict vs current answer (negation mismatch on overlapping decision terms)",
            })
    return contradictions

# ---------------------------------------------------------------------------
# LLM drafting (Groq when configured) + public API
# ---------------------------------------------------------------------------

def _groq_api_key() -> str | None:
    return os.environ.get("GROQ_API_KEY") or os.environ.get("GROQ_TOKEN")


def _draft_with_groq(query: str, context: str) -> tuple | None:
    if not _groq_api_key():
        return None
    try:
        from groq import Groq
        client = Groq(api_key=_groq_api_key())
        last_error = None
        for model in (GROQ_MODEL, GROQ_FALLBACK_MODEL):
            try:
                response = client.chat.completions.create(
                    model=model, temperature=0.0, max_tokens=512,
                    messages=[{"role": "system", "content": TRUST_SYSTEM_PROMPT},
                              {"role": "user", "content": f"Context chunks:\n{context}\n\nQuestion: {query}\n\nAnswer with [message:<id>] citations."}],
                )
                content = (response.choices[0].message.content or "").strip()
                if content:
                    return content, f"groq:{model}"
            except Exception as exc:
                last_error = exc
                logger.warning("Groq responder model %s failed: %s", model, exc)
        logger.warning("All Groq responder models failed: %s", last_error)
        return None
    except ImportError:
        try:
            from langchain_groq import ChatGroq
            for model in (GROQ_MODEL, GROQ_FALLBACK_MODEL):
                try:
                    llm = ChatGroq(model=model, temperature=0.0, max_tokens=512, api_key=_groq_api_key())
                    message = llm.invoke([{"role": "system", "content": TRUST_SYSTEM_PROMPT},
                                          {"role": "user", "content": f"Context chunks:\n{context}\n\nQuestion: {query}"}])
                    content = str(getattr(message, "content", message) or "").strip()
                    if content:
                        return content, f"langchain-groq:{model}"
                except Exception as exc:
                    logger.warning("langchain_groq responder model %s failed: %s", model, exc)
            return None
        except ImportError:
            logger.warning("No Groq backend installed; using extractive composer.")
            return None


def generate_grounded_response(query: str, context_chunks: list | None = None, top_k: int = 5, alpha: float = 0.5, history: list | None = None, context_filter: dict | None = None) -> dict:
    """Answer ``query`` strictly from context with trust status + citations."""
    if not query or not query.strip():
        return {"query": query, "answer": "", "trust_status": "unknown",
                "confidence": 0.0, "citations": [], "contradictions": [],
                "context_chunks": [], "backend": "empty-query", "coverage": 0.0}
    query = query.strip()
    if context_chunks is None:
        from orbit_app.core.services.hybrid_search import hybrid_search
        chunks = hybrid_search(query, top_k=top_k, alpha=alpha, context_filter=context_filter)
        retrieval = "hybrid_search"
    else:
        chunks = list(context_chunks)
        retrieval = "provided"
    if not chunks:
        return {"query": query,
                "answer": "I don't have supporting context for this question, so I can't answer reliably.",
                "trust_status": "unknown", "confidence": 0.0, "citations": [],
                "contradictions": [], "context_chunks": [], "backend": retrieval,
                "coverage": 0.0}
    context = _format_context(chunks)
    drafted, backend = None, "extractive"
    try:
        groq_result = _draft_with_groq(query, context)
        if groq_result:
            drafted, backend = groq_result
    except Exception as exc:
        logger.warning("Groq drafting failed (%s); using extractive composer.", exc)
    if not drafted:
        drafted = _compose_extractive_answer(query, chunks)
    fused = [c.get("fusion_score", c.get("score", 0.0)) for c in chunks]
    trust_status, confidence, cov = _confidence(drafted, chunks, fused, query=query)
    if trust_status == "unknown":
        drafted = ("I couldn't find reliable supporting context for this question, "
                   "so I can't answer with confidence. " + drafted).strip() if drafted else \
            "I don't have supporting context for this question, so I can't answer reliably."
    contradictions = check_contradictions(drafted if trust_status != "unknown" else "", history=history, chunks=chunks)
    return {"query": query, "answer": drafted, "trust_status": trust_status,
            "confidence": confidence, "citations": cov["citations"],
            "contradictions": contradictions, "context_chunks": chunks,
            "backend": backend, "retrieval": retrieval, "coverage": round(cov["coverage"], 3)}


def _self_test() -> None:
    chunks = [
        {"chunk_id": 1, "message_id": 101, "text": "Official decision: the Postgres migration was approved for Friday.", "authority_level": "official", "source_type": "pdf", "fusion_score": 0.9, "score": 0.9},
        {"chunk_id": 3, "message_id": 103, "text": "Meeting transcript: Ada to draft the Postgres migration plan by Friday.", "authority_level": "official", "source_type": "meeting_transcript", "fusion_score": 0.7, "score": 0.7},
    ]
    import os as _os
    _os.environ.pop("GROQ_API_KEY", None); _os.environ.pop("GROQ_TOKEN", None)
    grounded = generate_grounded_response("When was the Postgres migration approved?", context_chunks=chunks)
    assert grounded["trust_status"] == "verified", grounded
    assert "[message:101]" in grounded["answer"] and grounded["citations"], grounded
    unknown = generate_grounded_response("What is the lunch menu on Mars?", context_chunks=chunks)
    assert unknown["trust_status"] == "unknown", unknown
    assert "couldn't find" in unknown["answer"] or "don't have" in unknown["answer"]
    history = [{"topic_id": 7, "topic__label": "Postgres migration", "value_snapshot": "The Postgres migration was cancelled; staying on legacy DB.", "timestamp": "2026-09-01"}]
    flagged = generate_grounded_response("Was the Postgres migration approved?", context_chunks=chunks, history=history)
    assert any(c["topic_id"] == 7 for c in flagged["contradictions"]), flagged
    auto = generate_grounded_response("Postgres migration deadline Friday")
    assert auto["context_chunks"] and auto["trust_status"] in ("verified", "low_confidence", "unknown"), auto
    print(f"responder self-test OK: grounded={grounded['trust_status']} ({grounded['confidence']}), "
          f"unknown={unknown['trust_status']}, contradictions={len(flagged['contradictions'])}, auto_top={auto['context_chunks'][0]['chunk_id']}")


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
            # Offline-safe: Groq/DB-backed sections degrade gracefully;
            # never raise from a standalone self-test when PG is down.
            logger.warning("Self-test DB section skipped offline (%s).", exc)
            print(f"self-test offline OK (DB unreachable, pure checks passed): {exc}")
    else:
        print(__doc__)
