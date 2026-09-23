# Sentinel Test & Integration Guide — Team Orbit (UniPods Hackathon 2026)

Covers the full verification story for `orbit_backend/`: module self-tests, Django suites, DB shell E2E, the `POST /api/v1/chat` gateway contract, WhatsApp (Baileys) integration, and grounding/guardrail semantics.

> Model-key rule: `Message` uses an explicit BigAutoField PK **`message_id`** (never `id`). All queries/seeds use `Message.objects.get_or_create(message_id=...)` / `message_id=...`. Task Celery results expose `.id` (e.g. `ingest_message_task.delay(...).id`) — that is the Celery task id, not a model field.

---

## 1. Automated Test Suite

### 1.1 One-command runner

```bash
cd orbit_backend
./run_tests.sh
# Expect: Summary: 7 passed, 0 failed
```

`run_tests.sh` (executable, `chmod +x`) sets `DJANGO_SETTINGS_MODULE=orbit_app.settings` and runs, in order:

| # | Step | Command |
|---|------|---------|
| 1 | Chunks self-test (Step 2) | `PYTHONPATH=orbit_app python3 -m orbit_app.chunks.services --self-test` |
| 2 | Classifications self-test (Step 3) | `PYTHONPATH=orbit_app python3 -m orbit_app.classifications.services --self-test` |
| 3 | Hybrid-search self-test (Step 4) | `PYTHONPATH=orbit_app python3 -m orbit_app.core.services.hybrid_search --self-test` |
| 4 | Responder self-test (Step 4) | `PYTHONPATH=orbit_app python3 -m orbit_app.core.services.responder --self-test` |
| 5 | Django test suite (Step 5) | `python3 orbit_app/manage.py test orbit_app.core -v 1` |
| 6 | DB migrate (sqlite dev fallback) | `python3 orbit_app/manage.py migrate --run-syncdb` |
| 7 | DB shell E2E (`message_id=999` → `verified`) | `python3 orbit_app/manage.py shell` heredoc (seed → chunk/embed → `generate_grounded_response` assert) |

Reference output (offline, no `.env`/Postgres/keys):

```
=== chunks self-test (Step 2) ===
chunk_text: 2 chunks OK; token range [0, 288); generate_embeddings: 3 x 384 OK; Message PK=message_id OK
PASS: chunks self-test (Step 2)
=== classifications self-test (Step 3) ===
parse/validate/fallback OK; sample topic='We decided to use Postgres...' category='decision'
PASS: classifications self-test (Step 3)
=== hybrid_search self-test (Step 4) ===
hybrid_search self-test OK: top chunk=5 (authority=official, score=0.9375); ...
PASS: hybrid_search self-test (Step 4)
=== responder self-test (Step 4) ===
responder self-test OK: grounded=verified (0.837), unknown=unknown, contradictions=1, auto_top=5
PASS: responder self-test (Step 4)
=== Django test suite (Step 5) ===
Ran 2 tests ... OK
PASS: Django test suite (Step 5)
=== DB shell test: message_id=999 -> verified ===
seed message_id=999 (created=True)
trust_status: verified
answer: Official decision: the Postgres migration was approved for Friday. [message:999] ...
DB shell test OK: message_id=999 -> verified
PASS: DB shell test: message_id=999 -> verified
================ Summary: 7 passed, 0 failed ================
```

### 1.2 Individual commands (same as the script)

```bash
cd orbit_backend
PYTHONPATH=orbit_app python3 -m orbit_app.chunks.services --self-test
PYTHONPATH=orbit_app python3 -m orbit_app.classifications.services --self-test
PYTHONPATH=orbit_app python3 -m orbit_app.core.services.hybrid_search --self-test
PYTHONPATH=orbit_app python3 -m orbit_app.core.services.responder --self-test
python3 orbit_app/manage.py test orbit_app.core
```

### 1.3 DB shell E2E (manual form of script step 7)

```bash
cd orbit_backend
python3 orbit_app/manage.py migrate --run-syncdb
python3 orbit_app/manage.py shell <<'PYEOF'
from django.utils import timezone
from orbit_app.messages.models import Message
from orbit_app.chunks.services import ingest_message_chunks
from orbit_app.core.services.responder import generate_grounded_response
msg, created = Message.objects.get_or_create(
    message_id=999,  # explicit PK — never `id`
    defaults={"source_type": "pdf", "sender": "PMO", "timestamp": timezone.now(),
              "raw_text": "Official decision: the Postgres migration was approved for Friday. Ada to draft the migration plan.",
              "authority_level": "official"},
)
chunks = ingest_message_chunks(message=msg)
assert len(chunks) >= 1 and len(chunks[0].embedding) == 384
result = generate_grounded_response("When was the Postgres migration approved?")
assert result["trust_status"] == "verified", result
assert "Postgres" in result["answer"] and "Friday" in result["answer"]
print("DB shell test OK: message_id=999 -> verified")
PYEOF
```

### 1.4 Postgres-backed run (CI / staging)

`Chunk.embedding` is `ArrayField` on Postgres and `JSONField` on sqlite, so the same suite runs on both. For a production-like run:

```bash
docker run -d --name orbit-test-pg -e POSTGRES_DB=orbit_test -e POSTGRES_USER=orbit \
  -e POSTGRES_PASSWORD=orbitpass -p 5544:5432 postgres:16-alpine
cd orbit_backend
POSTGRES_DB=orbit_test POSTGRES_USER=orbit POSTGRES_PASSWORD=orbitpass POSTGRES_HOST=localhost POSTGRES_PORT=5544 \
  SECRET_KEY=test-secret DEBUG=True ALLOWED_HOSTS=localhost CELERY_BROKER_URL=redis://localhost:6379/0 \
  python3 orbit_app/manage.py test orbit_app.core -v 2
# Expect: Ran 2 tests ... OK
```

---

## 2. API Contract & Gateway Specification

Base: `POST /api/v1/chat` (slashless variant accepted). Aliases: `POST /api/copilot/ask` (± slash), `POST /copilot/ask` (± slash). Health: `GET /api/health/`. All chat routes are `AllowAny` (hackathon mode).

### 2.1 `POST /api/v1/chat` — Request

| Field | Type | Required | Default | Constraints | Notes |
|-------|------|----------|---------|-------------|-------|
| `message` | string | yes* | — | non-blank | Canonical query field. *Either `message` or `query` must be present. |
| `query` | string | yes* | — | non-blank | Alias for `message`. |
| `top_k` | integer | no | `5` | 1–50 | Hybrid-search depth. |
| `alpha` | float | no | `0.5` | 0.0–1.0 | Dense/sparse fusion weight (`1.0` = dense-only, `0.0` = sparse-only). |
| `stream` | boolean | no | `false` | — | Accepted; currently served as one complete response (streaming reserved). |
| `context_filter` | object | no | `{}` | AND semantics; unknown keys ignored | e.g. `{"source_type": "pdf"}`. Keys: `source_type`, `authority_level`, `sender`, `message_id`, `chunk_id`, `topic_id` (topic resolved via action items + classification labels). |

Example request:

```json
{
  "message": "When was the Postgres migration approved?",
  "top_k": 5,
  "alpha": 0.5,
  "stream": false,
  "context_filter": {"source_type": "pdf"}
}
```

```bash
curl -X POST http://localhost:8000/api/v1/chat/ \
  -H 'Content-Type: application/json' \
  -d '{"message": "When was the Postgres migration approved?", "top_k": 5, "alpha": 0.5}'
```

### 2.2 `POST /api/v1/chat` — Response (`200 OK`)

| Field | Type | Description |
|-------|------|-------------|
| `answer` | string | Grounded answer with inline `[message:<message_id>]` citations + `Sources:` line. Ungrounded → explicit "can't answer reliably" fallback text. |
| `trust_status` | `"verified" \| "low_confidence" \| "unknown"` | Grounding verdict (see §4). |
| `confidence` | float | 0.0–~1.0 blended score (coverage + retrieval strength + authority). `0.0` when `unknown`. |
| `citations` | `[{message_id: int \| null, text: string (≤500ch), source_type: string}]` | Supporting chunks backing the answer. |
| `action_items` | `[{task, description, owner: string\|null, deadline: string\|null, priority}]` | Open action items linked to cited messages (≤20). |
| `contradictions` | `[{topic_id, topic_label, past_snapshot, past_timestamp, reason}]` | Past `TopicHistory` decisions conflicting with this answer (polarity mismatch, Jaccard ≥ 0.15). |
| `retrieval_meta` | `{top_k: int, alpha: float, hits: int, latency_ms: float, backend: string, retrieval: string}` | `backend` = `extractive` or `groq:<model>`; `retrieval` = `hybrid_search` or `provided`. |

Example response:

```json
{
  "answer": "Official decision: the Postgres migration was approved for Friday. [message:999] Ada to draft the migration plan. [message:999]\nSources: message:999, message:999",
  "trust_status": "verified",
  "confidence": 0.837,
  "citations": [{"message_id": 999, "text": "Official decision: the Postgres migration was approved for Friday...", "source_type": "pdf"}],
  "action_items": [],
  "contradictions": [],
  "retrieval_meta": {"top_k": 5, "alpha": 0.5, "hits": 1, "latency_ms": 42.1, "backend": "extractive", "retrieval": "hybrid_search"}
}
```

### 2.3 Errors

- `400 Bad Request` — serializer errors, e.g. `{}` → `{"message": ["This field is required (or pass 'query')."]}`; `alpha: 9.0` → range error.
- `500 Internal Server Error` — `{"detail": "Copilot pipeline failed.", "error": "...", "diagnostic": "...", "latency_ms": 12.3}` (`diagnostic` carries a traceback only when `DEBUG=True`).

---

## 3. WhatsApp Gateway Integration Guide (Mamadou / Baileys)

The WhatsApp bot (Baileys, owned by Mamadou) sits between the user and Sentinel: it receives WhatsApp messages, forwards them to `POST /api/v1/chat`, and renders the grounded answer back into the chat.

### 3.1 Architecture

```
WhatsApp user ──▶ Baileys bot (Mamadou) ──POST /api/v1/chat──▶ Sentinel Django ──▶ answer + trust_status + citations
                        │                                                              │
                        └────────────── render + send WhatsApp reply ◀──────────────────┘
```

### 3.2 Request formatting (bot → Sentinel)

1. Extract the inbound text: `const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""`. Ignore empty/status/system messages.
2. Build the Sentinel payload — always send `message` (canonical), plus retrieval tuning and provenance filter:

```js
const payload = {
  message: text,          // required: raw user question
  top_k: 5,               // optional: 3-5 good for chat latency
  alpha: 0.5,             // optional: 0.5 balanced; 0.7+ favours semantic match
  stream: false,          // must be false (streaming not yet supported)
  context_filter: {       // optional: narrow scope when known
    // source_type: "pdf",        // e.g. official docs only
    // authority_level: "official",
    // topic_id: 3,
  },
};
await axios.post("https://sentinel.example.com/api/v1/chat/", payload, { timeout: 30000 });
```

3. WhatsApp ingestion path (optional, for grounding new chatter): persist inbound WhatsApp text as a `Message(source_type="whatsapp", authority_level="general")`, then run Step 2/3 (`ingest_message_chunks` → `save_extraction_results`) so future queries can cite it via `message_id`.

### 3.3 Response handling (Sentinel → bot → user)

```js
const { answer, trust_status, confidence, citations, contradictions, action_items } = res.data;
const sources = (citations || []).map(c => `#${c.message_id} (${c.source_type})`).join(", ");
if (trust_status === "verified") {
  await sock.sendMessage(from, { text: `✅ ${answer}\n\n📚 Sources: ${sources}` });
} else if (trust_status === "low_confidence") {
  await sock.sendMessage(from, { text: `⚠️ Unverified — confirm before acting:\n${answer}\n\n📚 Sources: ${sources}` });
} else { // "unknown"
  await sock.sendMessage(from, { text: `❓ I don't have reliable info on that yet. Try rephrasing or ask about a documented decision.` });
}
if (contradictions?.length) await sock.sendMessage(from, { text: `🚨 Note: this conflicts with an earlier record: ${contradictions[0].past_snapshot}` });
if (action_items?.length) await sock.sendMessage(from, { text: `📝 Open items:\n` + action_items.map(a => `• ${a.task}${a.owner ? ` (owner: ${a.owner})` : ""}`).join("\n") });
```

### 3.4 Operational checklist

- Timeout 30s; retry once on network error / 5xx (do **not** retry 400 — fix the payload).
- Never render `answer` without its `trust_status` badge; never send `low_confidence`/`unknown` answers as facts.
- Keep user text verbatim in `message` (no summarising — grounding needs exact terms).
- Health probe: `GET /api/health/` → `{"status": "ok"}` before going live.
- Rate-limit per sender to protect the Groq/embedding backends.

---

## 4. Grounding & Guardrail Verification

### 4.1 `trust_status` semantics

| Status | Meaning | When | What the user sees |
|--------|---------|------|--------------------|
| `verified` | Answer fully supported by retrieved context | Answer-word coverage ≥ 0.7 **and** (official source in top-2 **or** top fused score ≥ 0.5), valid `[message:<id>]` citations present, query terms grounded (≥ 0.3 overlap) | Cited answer + `✅` + `Sources:` line |
| `low_confidence` | Supported but weak | Coverage 0.35–0.7 or weak retrieval/authority | Answer + `⚠️ Unverified` badge; confirm before acting |
| `unknown` | No reliable support — **hallucination guardrail fired** | Empty context, coverage < 0.35, missing/invalid citations, or query ungrounded (< 0.3) | Explicit fallback: *"I couldn't find reliable supporting context ... / I don't have supporting context ..."* — never a fabricated fact |

`confidence` blends coverage (0.5) + retrieval strength (0.3) + official-hit bonus (0.2); it is `0.0` whenever `unknown`.

How to verify: grounded query (*"When was the Postgres migration approved?"* over seeded official text) → `verified` with `[message:999]`; unrelated query (*"What is the lunch menu on Mars?"*) → `unknown` with the fallback sentence. Both are asserted in `orbit_app/core/tests/test_copilot_pipeline.py` and the `message_id=999` shell test.

### 4.2 Citation format (`message_id`)

- Inline: every factual sentence ends with `[message:<message_id>]`, e.g. `... approved for Friday. [message:999]`. `message_id` is the **explicit PK** of the source `Message` row (never a row index).
- `Sources:` trailer lists each cited id (`Sources: message:999, message:999`).
- API `citations[]` objects carry `{message_id, text (≤500 chars), source_type}` so clients (WhatsApp bot, UI) can render provenance without parsing the answer string.
- Coverage check: a citation only counts when its id matches a retrieved chunk's `message_id`; answers with dangling ids fail to `unknown`.

### 4.3 Contradiction flagging

Current answer (whole + per-sentence + per-chunk segments) is compared to `TopicHistory.value_snapshot` rows: Jaccard term overlap ≥ 0.15 **and** negation-polarity mismatch (e.g. *approved* vs *cancelled*) → entry in `contradictions[]` with `{topic_id, topic_label, past_snapshot, past_timestamp, reason}`. Empty list = no conflict detected.
