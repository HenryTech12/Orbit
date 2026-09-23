# Orbit Backend — Sentinel (Team Orbit, UniPods Hackathon 2026)

## Step 2: Ingestion & Embeddings Pipeline

Implements text chunking + embeddings inside `orbit_app/chunks/`.

### Components

| Piece | Location | Notes |
| --- | --- | --- |
| `chunk_text(text, chunk_size=512, chunk_overlap=64)` | `orbit_app/chunks/services.py` | Overlapping chunks via `langchain_text_splitters.RecursiveCharacterTextSplitter`; preserves `token_start`/`token_end` + `char_start`/`char_end` per chunk. Pure-Python sliding-window fallback when langchain/tiktoken are missing. |
| `generate_embeddings(texts)` | `orbit_app/chunks/services.py` | One vector per text. Backend priority: Hugging Face Inference API (hosted bge-small-en) -> local CPU `sentence-transformers` -> deterministic offline fallback. |
| `ingest_message_chunks(...)` / `ingest_text_for_message(...)` | `orbit_app/chunks/services.py` | Splits text, embeds batches, `bulk_create`s rows into the `chunks` table (`message_id`, `text`, `embedding`, `token_start`, `token_end`). Idempotent via `replace_existing=True`. |
| Celery tasks `chunks.ingest_message` / `chunks.ingest_text` | `orbit_app/chunks/tasks.py` | Async ingestion with retries (`max_retries=3`). |
| Endpoints `ingest_chunks` / `enqueue_ingest_chunks` | `orbit_app/chunks/views.py` (+ `serializers.py`) | Sync (201) and async-enqueue (202 + `task_id`) variants. |

### Embedding model

- **Model:** `BAAI/bge-small-en-v1.5` (**bge-small-en**, **384 dimensions**).
- Every backend output is validated to be exactly **384 floats** per vector, matching the `chunks.embedding` column (`ArrayField(FloatField)` of length 384; pgvector-ready — migratable to `VectorField(dimensions=384)` later).
- Local execution runs on **CPU** (`SentenceTransformer(model, device="cpu")`, normalised embeddings).
- Set `EMBEDDING_MODEL_NAME` / `EMBEDDING_DIMENSIONS` env vars to override; `HF_API_KEY` (or `HUGGINGFACEHUB_API_TOKEN`) enables the hosted-API backend. Without a key the pipeline uses the local model, falling back to deterministic offline vectors if weights are unavailable.

### Text chunking parameters

- **Chunk size:** `512` tokens; **overlap:** `64` tokens (env-overridable via `CHUNK_SIZE` / `CHUNK_OVERLAP`).
- Token counting uses `tiktoken` (`cl100k_base`) when installed, else ~`chars/4`.
- With `tiktoken`, the splitter is truly token-sized; without it, sizes are approximated as `512*4` chars with `64*4` overlap.
- Each chunk dict: `{index, text, token_start, token_end, char_start, char_end}`. `token_start`/`token_end` map to the `chunks` table columns; char offsets are returned for grounding (and a future schema migration).

### Dependencies (added to `orbit_app/requirements.txt`)

```
langchain-text-splitters==0.3.0
sentence-transformers==3.3.1
tiktoken==0.9.0
requests==2.32.3
--extra-index-url https://download.pytorch.org/whl/cpu
torch
```

Install: `pip install -r orbit_app/requirements.txt` (CPU torch via the extra index).

### How to test locally (no DB)

```bash
cd orbit_backend
PYTHONPATH=orbit_app python -m orbit_app.chunks.services --self-test
# or
grep -q tiktoken orbit_app/requirements.txt || true
python - <<'PY'
import importlib.util
spec = importlib.util.spec_from_file_location("svc", "orbit_app/chunks/services.py")
svc = importlib.util.module_from_spec(spec); spec.loader.exec_module(svc)
chunks = svc.chunk_text(("Orbit Sentinel ingests WhatsApp messages. " * 60))
print(len(chunks), "chunks;", "first:", chunks[0])
vecs = svc.generate_embeddings([c["text"] for c in chunks[:2]])
print("embeddings:", len(vecs), "x", len(vecs[0]))
PY
```

Expect: `N chunks` with `token_end > token_start`, overlapping neighbours (`b.char_start < a.char_end`), and `M x 384` embeddings.

### How to test with Django + DB

```bash
# from orbit_backend/
python orbit_app/manage.py shell -c "
from orbit_app.messages.models import Message
from orbit_app.chunks.services import ingest_message_chunks
msg = Message.objects.first()
created = ingest_message_chunks(message=msg)  # or message_id=msg.pk, text='...'
print(len(created), 'chunks; dim =', len(created[0].embedding))
"
```

### How to test via Celery tasks

```bash
# terminal 1: worker
celery -A orbit_app worker -l info
# terminal 2: enqueue (shell or HTTP)
python orbit_app/manage.py shell -c "
from orbit_app.chunks.tasks import ingest_message_task
print(ingest_message_task.delay(message_id=1).id)
"
# sync alternative without a broker:
python orbit_app/manage.py shell -c "
from orbit_app.chunks.tasks import ingest_message_task
print(ingest_message_task.run(message_id=1))
"
```

The task returns `{"message_id": ..., "chunks_created": N}` and retries transient failures 3x.

## Step 3: Structured Extraction Pipeline

LLM extraction of topics, decisions, action items, owners and deadlines in `orbit_app/classifications/`.

### Components

| Piece | Location | Notes |
| --- | --- | --- |
| `extract_structured_metadata(text, context_metadata=None)` | `orbit_app/classifications/services.py` | Primary service: Groq LLM (`groq` SDK, `langchain_groq` alternative) with strict system prompt + deterministic rule-based fallback. Returns `{topic, category, summary, decisions, action_items, _backend}`. |
| `parse_llm_json(raw)` / `validate_extraction(payload, ctx)` | `orbit_app/classifications/services.py` | Robust parsing (strips ```` ```json ```` fences, prose wrappers, trailing text via balanced-brace scan); validation clamps enums, coerces `owner`/`deadline` to `null` when ambiguous, normalises dates vs message timestamp. |
| `save_extraction_results(message/message_id, ...)` | `orbit_app/classifications/services.py` | Persists: `Topic` record (`get_or_create` on label); one `Classification` row per chunk (category mapped to `announcement|general`, item_type to `question|decision|action_item`); `ActionItem` rows (topic + `source_chunk`, `owner`, `deadline`, `status=open`). |
| `process_message_extraction_task(message_id, ...)` | `orbit_app/classifications/tasks.py` | Async Celery task: Step 2 `ingest_message_chunks(...)` then Step 3 extract + persist. Returns `{message_id, topic, category, chunks_created, decisions, action_items, backend}`. `extract_text_task` variant for document text. |
| `extract_message` / `enqueue_extraction` | `orbit_app/classifications/views.py` (+ `serializers.py`) | Sync (201) and async-enqueue (202 + `task_id`) endpoints. |

### Groq model & environment

- **Primary model:** `llama-3.3-70b-versatile` (override via `GROQ_MODEL`); **fallback:** `mixtral-8x7b-32768` (via `GROQ_FALLBACK_MODEL`). Low temperature (`0.0`) + `response_format={"type": "json_object"}` enforce strict JSON.
- **Env vars:** `GROQ_API_KEY` (or `GROQ_TOKEN`) enables the LLM backend; without it the pipeline uses the offline rule-based extractor (explicit-only, never guesses owner/deadline). Optional: `GROQ_MODEL`, `GROQ_FALLBACK_MODEL`, `GROQ_TEMPERATURE`, `GROQ_MAX_TOKENS`.
- New deps in `orbit_app/requirements.txt`: `groq==0.13.1`, `langchain-groq==0.2.5`; new keys in `.env.example`.

### JSON schema extracted

```json
{
  "topic": "string (3-8 word label)",
  "category": "decision | announcement | task | general",
  "summary": "string (1-2 sentences)",
  "decisions": ["explicit decisions only"],
  "action_items": [
    {"task": "string", "owner": "string | null", "deadline": "YYYY-MM-DD | string | null", "priority": "high | medium | low"}
  ]
}
```

System-prompt rules: extract **only explicit** decisions/assignments; `owner`/`deadline` → `null` when ambiguous; relative dates normalised to `YYYY-MM-DD` against `context_metadata.timestamp` when available; empty lists (never `null`) when none.

Note: the DB `Classification` model only allows `category ∈ {announcement, general}` and `item_type ∈ {question, decision, action_item}`, so Step 3 categories map: `announcement→announcement`, else `general`; item type `decision` if decisions (or category `decision`), `action_item` if tasks, else `question`.

### Self-tests (no DB / no API key)

```bash
cd orbit_backend
python3 orbit_app/classifications/services.py --self-test
# Expect: parse/validate/fallback OK; sample topic='...' category='...'
```

Covers: ```` ```json ````-fence + prose-wrapped parsing, enum clamping, `null`-preservation, and the offline fallback path.

### Test via Django shell

```bash
# LLM path (needs GROQ_API_KEY + DB):
python orbit_app/manage.py shell -c "
from orbit_app.classifications.services import extract_structured_metadata, save_extraction_results
print(extract_structured_metadata('We decided to use Postgres. Alice please draft the plan by 2026-09-30.', {'timestamp': '2026-09-19T00:00:00Z'}))
print(save_extraction_results(message_id=1))
"
# Offline path (no key): same calls, result contains '_backend': 'fallback'.
```

### Test via Celery tasks

```bash
# terminal 1: worker
celery -A orbit_app worker -l info
# terminal 2:
python orbit_app/manage.py shell -c "
from orbit_app.classifications.tasks import process_message_extraction_task
print(process_message_extraction_task.delay(message_id=1).id)
"
# sync alternative without a broker:
python orbit_app/manage.py shell -c "
from orbit_app.classifications.tasks import process_message_extraction_task
print(process_message_extraction_task.run(message_id=1))
"
```

## Step 4: Hybrid Search & Grounded Copilot Engine

Core retrieval + grounded answering in `orbit_app/core/services/` (`hybrid_search.py`, `responder.py`).

### Components

| Piece | Location | Notes |
| --- | --- | --- |
| `hybrid_search(query, top_k=5, alpha=0.5)` | `orbit_app/core/services/hybrid_search.py` | Dense (Step 2 `generate_embeddings` + cosine; pgvector `<=>` when available) fused with sparse (Postgres FTS `ts_rank` when available, else in-Python BM25), then source-authority weighted. |
| `generate_grounded_response(query, context_chunks=None)` | `orbit_app/core/services/responder.py` | Trust-layer answering: auto-retrieves via `hybrid_search` when chunks omitted; Groq drafting when `GROQ_API_KEY` set, else deterministic extractive composer; grounding post-check + `topics_history` contradiction check. |
| `check_contradictions(answer, history=None, chunks=None)` | `orbit_app/core/services/responder.py` | Per-segment polarity check (negation mismatch on overlapping decision terms, Jaccard >= 0.15) against `TopicHistory.value_snapshot` rows. |

### Hybrid search scoring logic (Dense + Sparse + Authority Weighting)

1. **Dense:** query embedded with `generate_embeddings()` (Step 2, bge-small-en 384-d). With a live DB the service tries `SELECT chunk_id, embedding <=> %s::vector` (pgvector cosine distance → `1 - distance`); otherwise pure-Python cosine `(cos+1)/2` against loaded chunk vectors (offline demo corpus uses a token-overlap proxy so `alpha` semantics still hold in self-test).
2. **Sparse:** with a live DB it tries Postgres Full-Text Search (`to_tsvector('english', text) @@ plainto_tsquery`, ranked by `ts_rank`); otherwise in-Python **BM25** (`k1=1.5`, `b=0.75`) over the candidate chunk texts.
3. **Fusion:** each branch is min-max normalised to `[0, 1]`, then combined as `fused = alpha * dense_norm + (1 - alpha) * sparse_norm` (`alpha=0.5` default; `1.0` = dense-only, `0.0` = sparse-only). **RRF** (`k=60`, `1/(k+rank)` per branch) is computed as a diagnostic in `fusion_details` alongside `dense_norm`/`sparse_norm`.
4. **Source authority weighting:** `final = fused * boost`, with `boost = AUTHORITY_BOOST_GENERAL (1.0)` × `AUTHORITY_BOOST_OFFICIAL (1.5)` when `message.authority_level='official'` × `AUTHORITY_BOOST_DOCUMENT (1.25)` when `message.source_type ∈ {meeting_transcript, pdf, document}`. So official PDFs/transcripts outrank general WhatsApp chatter; all boosts env-tunable (`AUTHORITY_BOOST_*`, `DOCUMENT_SOURCE_TYPES`, `HYBRID_RRF_K`, `HYBRID_OVERFETCH`).
5. Each hit returns `{chunk_id, message_id, text, authority_level, source_type, sender, token_start/end, dense_score, sparse_score, fusion_score, authority_boost, score, fusion_details, retrieval_backend}` sorted by `score`.

### Grounded prompt structure and confidence levels

Trust-layer system prompt (`TRUST_SYSTEM_PROMPT`): answer **strictly** from provided chunks, every claim cited as `[message:<id>]`, no invented names/dates/decisions, 2–6 sentences + `Sources:` line; if unsupported, say so explicitly.

- **Drafting:** Groq chat (`GROQ_MODEL`, default `llama-3.3-70b-versatile`, fallback `mixtral-8x7b-32768`) when `GROQ_API_KEY` is set; otherwise the deterministic extractive composer (top overlapping sentences + citations). Both go through the same grounding post-check.
- **Hallucination guardrail:** `_coverage` (answer content-word support + valid-citation check) plus `_query_grounding` (query-term support in context, threshold 0.3). Failure → answer replaced with an explicit "can't answer reliably" message and `"trust_status": "unknown"`.
- **Confidence:** `"verified"` (coverage ≥ 0.7 + official hit or top fused score ≥ 0.5), `"low_confidence"` (supported but weak), `"unknown"` (unsupported). Returned dict: `{query, answer, trust_status, confidence, citations, contradictions, context_chunks, backend, retrieval, coverage}`.
- **Contradictions:** current answer (whole + per-sentence + per-chunk segments) vs `TopicHistory.value_snapshot` rows; a past snapshot flags when Jaccard(term overlap) ≥ 0.15 **and** negation polarity differs (e.g. "approved" vs "cancelled"). Each entry: `{topic_id, topic_label, past_snapshot, past_timestamp, reason}`.

### How to test hybrid retrieval and response generation

```bash
cd orbit_backend
PYTHONPATH=/home/kamate/kd/projects/Orbit/orbit_backend python3 -m orbit_app.core.services.hybrid_search --self-test
# Expect: hybrid_search self-test OK: top chunk=5 (authority=official, ...); alpha=1 top=1, alpha=0 top=5
PYTHONPATH=/home/kamate/kd/projects/Orbit/orbit_backend python3 -m orbit_app.core.services.responder --self-test
# Expect: responder self-test OK: grounded=verified (...), unknown=unknown, contradictions=1, auto_top=5
```

Both self-tests are offline-safe (no DB/key needed; they use an in-memory demo corpus, Step 2 offline embeddings, and the extractive composer).

Django shell (needs DB; Groq optional):

```bash
python orbit_app/manage.py shell -c "
from orbit_app.core.services.hybrid_search import hybrid_search
from orbit_app.core.services.responder import generate_grounded_response
print([(h['chunk_id'], round(h['score'], 3), h['authority_level']) for h in hybrid_search('Postgres migration deadline', top_k=5, alpha=0.5)])
print(generate_grounded_response('When was the Postgres migration approved?')['answer'])
print(generate_grounded_response('When was the Postgres migration approved?')['trust_status'])
"
```

## Step 5: API Gateway & End-to-End Testing

DRF gateway over the Step 4 grounded copilot in `orbit_app/core/` (+ master integration test).

### Components

| Piece | Location | Notes |
| --- | --- | --- |
| `ChatRequestSerializer` / `ChatResponseSerializer` (+ `Citation/ActionItem/Contradiction/RetrievalMeta` subs) | `orbit_app/core/serializers.py` | Accepts `message` (canonical) or `query` alias; `top_k` (1–50, default 5), `alpha` (0–1, default 0.5), `stream` (default false, reserved), `context_filter` (dict, e.g. `{"source_type": "pdf"}`). |
| `ChatCopilotView(APIView)` | `orbit_app/core/views.py` | `POST` handler: validates request → `generate_grounded_response(query, top_k, alpha, context_filter)` → 200 JSON matching `ChatResponseSerializer`; unexpected errors → 500 `{detail, error, diagnostic, latency_ms}`. Also enriches `citations` (`message_id/text/source_type`) and `action_items` from DB. |
| Routes | `orbit_app/core/urls.py` + `orbit_app/urls.py` | `POST /api/v1/chat` (+ slashless), `POST /api/copilot/ask` (+ slashless), alias `POST /copilot/ask` (± slash). Health stays at `GET /api/health/`. |
| `context_filter` plumbing | `core/services/hybrid_search.py` (`_matches_filter`, `_topic_ids_for_chunks`) + `responder.py` | AND-semantics filter on `source_type/authority_level/sender/message_id/chunk_id/topic_id` (topic resolved via action items + classification labels); unknown keys ignored. |
| Master test | `orbit_app/core/tests/test_copilot_pipeline.py` | `CopilotPipelineTest`: ingests a mock official PDF `Message`, runs Step 2 chunk/embed (asserts 384-d), Step 3 extraction, grounded `POST /api/v1/chat` (200, `verified`, facts + citations + `retrieval_meta`), alias `POST /copilot/ask` parity, ungrounded query → `unknown`, plus 400-validation cases. |

### Endpoint contracts (`POST /api/v1/chat`)

Request (JSON):

```json
{
  "message": "When was the Postgres migration approved?",
  "top_k": 5,
  "alpha": 0.5,
  "stream": false,
  "context_filter": {"source_type": "pdf"}
}
```

(`query` may be used instead of `message`. `context_filter` also supports `authority_level`, `sender`, `message_id`, `chunk_id`, `topic_id`.)

Response `200 OK` (JSON):

```json
{
  "answer": "Official decision: the Postgres migration was approved for Friday. [message:1] ...\nSources: message:1",
  "trust_status": "verified",
  "confidence": 0.837,
  "citations": [{"message_id": 1, "text": "Official decision: ...", "source_type": "pdf"}],
  "action_items": [{"task": "...", "description": "...", "owner": null, "deadline": null, "priority": "medium"}],
  "contradictions": [],
  "retrieval_meta": {"top_k": 5, "alpha": 0.5, "hits": 1, "latency_ms": 42.1, "backend": "extractive", "retrieval": "hybrid_search"}
}
```

- `trust_status`: `verified` (grounded, official/high-score support) | `low_confidence` (supported but weak) | `unknown` (no reliable context; answer states this explicitly).
- Errors: invalid payload → `400` with field errors; pipeline failure → `500 {"detail": "Copilot pipeline failed.", "error", "diagnostic", "latency_ms"}` (traceback in `diagnostic` only when `DEBUG=True`).

### Commands to run the integration test suite

```bash
# needs Postgres (ArrayField) — e.g. podman/docker:
# docker run -d --name orbit-test-pg -e POSTGRES_DB=orbit_test -e POSTGRES_USER=orbit \
#   -e POSTGRES_PASSWORD=orbitpass -p 5544:5432 postgres:16-alpine
cd orbit_backend
POSTGRES_DB=orbit_test POSTGRES_USER=orbit POSTGRES_PASSWORD=orbitpass POSTGRES_HOST=localhost POSTGRES_PORT=5544 \
  SECRET_KEY=test-secret DEBUG=True ALLOWED_HOSTS=localhost CELERY_BROKER_URL=redis://localhost:6379/0 \
  python3 orbit_app/manage.py test orbit_app.core -v 2
# Expect: Ran 2 tests ... OK (grounded verified + ungrounded unknown + validation).
```

Notes: the suite runs fully offline for ML (Step 2 offline embeddings, Step 3 rule-based fallback, extractive composer) — no `GROQ_API_KEY`/model weights needed. With `GROQ_API_KEY` set, the same endpoint uses Groq drafting behind the identical trust-layer post-check. `stream: true` is accepted and currently served as a single complete response (streaming reserved for a follow-up).
