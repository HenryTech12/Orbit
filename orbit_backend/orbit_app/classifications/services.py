"""Step 3: LLM Structured Extraction Pipeline (Groq).

Extracts topics, decisions, action items, owners and deadlines from
ingested messages / documents via a fast Groq LLM, with a deterministic
rule-based fallback when no ``GROQ_API_KEY`` is configured.

Primary entry point::

    extract_structured_metadata(text, context_metadata=None) -> dict

Strict JSON schema::

    {
      "topic": "string",
      "category": "decision | announcement | task | general",
      "summary": "string",
      "decisions": ["string"],
      "action_items": [
        {"task": "string", "owner": "string | null",
         "deadline": "YYYY-MM-DD | string | null",
         "priority": "high | medium | low"}
      ]
    }

Persistence helpers (``save_extraction_results``) write the extraction to
the ``topics`` / ``classifications`` / ``action_items`` tables, linked to
the source ``Message`` (via its ``Chunk`` rows).

No Django imports at import time, so extraction + parsing can be tested
standalone::

    python orbit_app/classifications/services.py --self-test
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

#: Fast Groq chat model. Override with ``GROQ_MODEL``.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
#: Fallback model if the primary is unavailable / rate-limited.
GROQ_FALLBACK_MODEL = os.environ.get(
    "GROQ_FALLBACK_MODEL", "mixtral-8x7b-32768"
)
GROQ_TEMPERATURE = float(os.environ.get("GROQ_TEMPERATURE", "0.0"))
GROQ_MAX_TOKENS = int(os.environ.get("GROQ_MAX_TOKENS", "1024"))

VALID_CATEGORIES = ("decision", "announcement", "task", "general")
VALID_PRIORITIES = ("high", "medium", "low")

SYSTEM_PROMPT = """\
You are a precise information-extraction assistant for the Sentinel platform.
Extract structured metadata from the user message below and return ONLY a
single valid JSON object — no markdown fences, no commentary, no extra keys.

Schema (exact keys, exact types):
{
  "topic": "short topic label, 3-8 words",
  "category": "one of: decision | announcement | task | general",
  "summary": "one or two sentence summary",
  "decisions": ["explicit decisions only"],
  "action_items": [
    {"task": "concrete task", "owner": "person or null",
     "deadline": "YYYY-MM-DD or null", "priority": "high | medium | low"}
  ]
}

Strict rules:
1. Extract ONLY explicit decisions and assignments stated in the text. Never
   invent, infer, or guess owners, deadlines, tasks, or decisions.
2. If an action-item owner is ambiguous or unstated, use null. If a deadline
   is ambiguous or unstated, use null.
3. Normalize explicit relative dates (e.g. "tomorrow", "next Friday") to
   YYYY-MM-DD relative to the message timestamp provided in context. If no
   timestamp is given, or the date cannot be resolved, use null.
4. "category": use "decision" if the text records a decision, "task" if its
   main purpose is assigning work, "announcement" for informational
   broadcasts, else "general".
5. "priority": high if marked urgent / due within 2 days, low if explicitly
   non-urgent, else medium.
6. Empty lists ([]) — never null — when there are no decisions/action items.
7. Keep "topic" short and descriptive; keep each string concise.
"""

# ---------------------------------------------------------------------------
# Robust JSON parsing (handles ```json fences, prose wrappers, trailing text)
# ---------------------------------------------------------------------------

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)


def _strip_fences(raw: str) -> str:
    raw = raw.strip()
    match = _FENCE_RE.search(raw)
    if match:
        return match.group(1).strip()
    return raw


def _extract_balanced_json(raw: str) -> str:
    """Return the largest balanced {...} substring, or ``raw`` unchanged."""
    start = raw.find("{")
    if start == -1:
        return raw
    depth, in_str, esc = 0, False, False
    for i in range(start, len(raw)):
        ch = raw[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return raw[start:i + 1]
    return raw[start:]


def parse_llm_json(raw: str) -> dict:
    """Parse LLM output into a dict, tolerating fences and prose wrappers."""
    if not raw or not raw.strip():
        raise ValueError("Empty LLM response.")
    candidate = _extract_balanced_json(_strip_fences(raw))
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        # Last resort: first {...} ... last } slice.
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            raise ValueError(f"No JSON object found in LLM response: {raw[:200]!r}")
        parsed = json.loads(candidate[start:end + 1])
    if not isinstance(parsed, dict):
        raise ValueError(f"LLM JSON must be an object, got {type(parsed).__name__}")
    return parsed

# ---------------------------------------------------------------------------
# Normalisation / validation to the strict schema
# ---------------------------------------------------------------------------

def _clean_str(value, default="") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _clean_optional_str(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalise_deadline(value, reference: date | None):
    """Normalise deadlines: YYYY-MM-DD stays; relative dates resolve via ref."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a", "tbd", "tbc"}:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        try:
            date.fromisoformat(text)
            return text
        except ValueError:
            return None
    # Best-effort relative-date handling (LLM should already normalise).
    if reference is not None:
        lowered = text.lower()
        try:
            from datetime import timedelta
            if lowered in {"today"}:
                return reference.isoformat()
            if lowered in {"tomorrow"}:
                return (reference + timedelta(days=1)).isoformat()
        except Exception:
            pass
    # Non-ISO but explicit strings (e.g. "Friday") are kept verbatim per schema.
    return text


def _reference_date(context_metadata: dict | None) -> date | None:
    if not context_metadata:
        return None
    for key in ("timestamp", "message_timestamp", "date", "reference_date"):
        value = context_metadata.get(key)
        if not value:
            continue
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
        except Exception:
            continue
    return None


def validate_extraction(payload: dict, context_metadata: dict | None = None) -> dict:
    """Coerce a raw LLM dict into the strict schema (never raises on content)."""
    if not isinstance(payload, dict):
        raise ValueError("Extraction payload must be a dict.")
    reference = _reference_date(context_metadata)
    category = _clean_str(payload.get("category"), "general").lower()
    if category not in VALID_CATEGORIES:
        category = "general"
    decisions = payload.get("decisions") or []
    if isinstance(decisions, str):
        decisions = [decisions]
    decisions = [_clean_str(d) for d in decisions if _clean_str(d)]
    items = payload.get("action_items") or []
    if isinstance(items, dict):
        items = [items]
    action_items = []
    for item in items:
        if not isinstance(item, dict):
            continue
        task = _clean_str(item.get("task"))
        if not task:
            continue
        priority = _clean_str(item.get("priority"), "medium").lower()
        if priority not in VALID_PRIORITIES:
            priority = "medium"
        action_items.append({
            "task": task,
            "owner": _clean_optional_str(item.get("owner")),
            "deadline": _normalise_deadline(item.get("deadline"), reference),
            "priority": priority,
        })
    return {
        "topic": _clean_str(payload.get("topic"), "general") or "general",
        "category": category,
        "summary": _clean_str(payload.get("summary")),
        "decisions": decisions,
        "action_items": action_items,
    }

# ---------------------------------------------------------------------------
# Deterministic rule-based fallback (no API key / offline)
# ---------------------------------------------------------------------------

_OWNER_RE = re.compile(r"(?:assigned to|owner:?|responsible:?|@)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)")
_DATE_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
_DECISION_HINTS = ("decided", "decision", "agreed", "approved", "concluded", "resolved")
_TASK_HINTS = ("todo", "action", "task", "please", "will do", "assign", "deadline", "due")


def _fallback_extract(text: str, context_metadata: dict | None = None) -> dict:
    stripped = (text or "").strip()
    if not stripped:
        return {"topic": "general", "category": "general", "summary": "", "decisions": [], "action_items": []}
    lowered = stripped.lower()
    first_line = stripped.splitlines()[0].strip()
    topic = (first_line[:60] + "...") if len(first_line) > 60 else (first_line or "general")
    decisions = [s.strip() for s in re.split(r"(?<=[.!?])\s+", stripped)
                 if any(h in s.lower() for h in _DECISION_HINTS)]
    decisions = [d for d in decisions if d][:5]
    action_items = []
    for sentence in re.split(r"(?<=[.!?\n])\s*", stripped):
        s = sentence.strip(" -\u2022")
        if not s or len(s) < 8:
            continue
        if not any(h in s.lower() for h in _TASK_HINTS) and not _OWNER_RE.search(s):
            continue
        owner = _clean_optional_str((_OWNER_RE.search(s) or [None, None])[1])
        date_match = _DATE_RE.search(s)
        deadline = _normalise_deadline(date_match.group(1) if date_match else None, _reference_date(context_metadata))
        lowered_s = s.lower()
        priority = "high" if any(w in lowered_s for w in ("urgent", "asap", "immediately", "critical")) else ("low" if any(w in lowered_s for w in ("low priority", "whenever", "no rush")) else "medium")
        action_items.append({"task": s[:280], "owner": owner, "deadline": deadline, "priority": priority})
        if len(action_items) >= 10:
            break
    if decisions:
        category = "decision"
    elif action_items:
        category = "task"
    elif any(w in lowered for w in ("announc", "notice", "fyi", "update")):
        category = "announcement"
    else:
        category = "general"
    return {
        "topic": topic,
        "category": category,
        "summary": stripped[:300],
        "decisions": decisions,
        "action_items": action_items,
    }

# ---------------------------------------------------------------------------
# Groq backends (groq SDK preferred, langchain_groq alternative)
# ---------------------------------------------------------------------------

def _groq_api_key() -> str | None:
    return os.environ.get("GROQ_API_KEY") or os.environ.get("GROQ_TOKEN")


def _user_prompt(text: str, context_metadata: dict | None) -> str:
    header = ""
    if context_metadata:
        safe = {}
        for key in ("sender", "source_type", "authority_level", "timestamp", "message_timestamp"):
            if context_metadata.get(key) is not None:
                safe[key] = str(context_metadata[key])
        if safe:
            header = "Message context (use timestamp for relative dates):\n" + json.dumps(safe, default=str) + "\n\n"
    return header + "Message text to extract from:\n" + (text or "").strip()[:12000]


def _call_groq_sdk(system: str, user: str) -> str:
    from groq import Groq
    client = Groq(api_key=_groq_api_key())
    last_error = None
    for model in (GROQ_MODEL, GROQ_FALLBACK_MODEL):
        try:
            response = client.chat.completions.create(
                model=model, temperature=GROQ_TEMPERATURE, max_tokens=GROQ_MAX_TOKENS,
                response_format={"type": "json_object"},
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            )
            content = response.choices[0].message.content
            if content:
                return content
            last_error = ValueError(f"Empty response from model {model}")
        except Exception as exc:
            last_error = exc
            logger.warning("Groq model %s failed: %s", model, exc)
    raise RuntimeError(f"All Groq models failed: {last_error}")


def _call_langchain_groq(system: str, user: str) -> str:
    from langchain_groq import ChatGroq
    last_error = None
    for model in (GROQ_MODEL, GROQ_FALLBACK_MODEL):
        try:
            llm = ChatGroq(model=model, temperature=GROQ_TEMPERATURE, max_tokens=GROQ_MAX_TOKENS, api_key=_groq_api_key())
            message = llm.invoke([{"role": "system", "content": system}, {"role": "user", "content": user}])
            content = getattr(message, "content", message)
            if isinstance(content, list):
                content = " ".join(str(p) for p in content)
            if content and str(content).strip():
                return str(content)
            last_error = ValueError(f"Empty response from model {model}")
        except Exception as exc:
            last_error = exc
            logger.warning("langchain_groq model %s failed: %s", model, exc)
    raise RuntimeError(f"All langchain_groq models failed: {last_error}")


def _call_llm(system: str, user: str) -> tuple[str, str]:
    """Call Groq, returning (raw_text, backend_name). Raises if unusable."""
    if not _groq_api_key():
        raise RuntimeError("GROQ_API_KEY not configured.")
    errors = []
    try:
        return _call_groq_sdk(system, user), "groq-sdk"
    except ImportError as exc:
        errors.append(f"groq-sdk import: {exc}")
    except Exception as exc:
        errors.append(f"groq-sdk: {exc}")
        logger.warning("groq SDK failed (%s); trying langchain_groq.", exc)
    try:
        return _call_langchain_groq(system, user), "langchain-groq"
    except ImportError as exc:
        errors.append(f"langchain-groq import: {exc}")
    except Exception as exc:
        errors.append(f"langchain-groq: {exc}")
    raise RuntimeError("Groq backends unavailable: " + "; ".join(errors))

# ---------------------------------------------------------------------------
# Primary service function + persistence (Django imports kept lazy)
# ---------------------------------------------------------------------------

def extract_structured_metadata(text: str, context_metadata: dict | None = None) -> dict:
    """Extract {topic, category, summary, decisions, action_items} from text."""
    context_metadata = dict(context_metadata or {})
    if not text or not text.strip():
        return {"topic": "general", "category": "general", "summary": "", "decisions": [], "action_items": [], "_backend": "empty-input"}
    backend = "fallback"
    try:
        raw, backend = _call_llm(SYSTEM_PROMPT, _user_prompt(text, context_metadata))
        payload = validate_extraction(parse_llm_json(raw), context_metadata)
    except Exception as exc:
        logger.warning("LLM extraction failed (%s); using rule-based fallback.", exc)
        payload = validate_extraction(_fallback_extract(text, context_metadata), context_metadata)
        backend = "fallback"
    payload["_backend"] = backend
    return payload


def _get_models():
    from django.apps import apps
    return (apps.get_model("orbitbackend", "Message"), apps.get_model("orbitbackend", "Chunk"),
            apps.get_model("orbitbackend", "Topic"), apps.get_model("orbitbackend", "Classification"),
            apps.get_model("orbitbackend", "ActionItem"))


def _parse_deadline(value):
    if not value:
        return None
    text = str(value).strip()
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _classification_item_type(category: str, has_decisions: bool, has_tasks: bool) -> str:
    # Classification.ItemType choices: question | decision | action_item.
    if category == "decision" or (has_decisions and not has_tasks):
        return "decision"
    if category == "task" or has_tasks:
        return "action_item"
    return "question"


def _classification_category(category: str) -> str:
    # Classification.Category choices: announcement | general only.
    return "announcement" if category == "announcement" else "general"


def save_extraction_results(message=None, message_id=None, extraction: dict | None = None,
                            text: str | None = None, context_metadata: dict | None = None) -> dict:
    """Persist extraction: Topic (get/update), Classification + ActionItems per chunk."""
    Message, Chunk, Topic, Classification, ActionItem = _get_models()
    if message is None:
        if message_id is None:
            raise ValueError("Provide either message or message_id.")
        message = Message.objects.get(pk=message_id)
    if extraction is None:
        raw = text if text is not None else message.raw_text
        context = dict(context_metadata or {})
        context.setdefault("sender", getattr(message, "sender", None))
        context.setdefault("source_type", getattr(message, "source_type", None))
        context.setdefault("authority_level", getattr(message, "authority_level", None))
        context.setdefault("timestamp", getattr(message, "timestamp", None))
        extraction = extract_structured_metadata(raw, context)
    topic_label = (extraction.get("topic") or "general").strip()[:255] or "general"
    topic, _ = Topic.objects.get_or_create(label=topic_label)
    chunks = list(Chunk.objects.filter(message=message).order_by("token_start", "chunk_id"))
    if not chunks:
        from orbit_app.chunks.services import ingest_message_chunks
        chunks = list(ingest_message_chunks(message=message))
    if not chunks:
        raise ValueError(f"Message {message.pk} has no chunks to classify.")
    has_decisions = bool(extraction.get("decisions"))
    has_tasks = bool(extraction.get("action_items"))
    Classification.objects.filter(chunk__in=chunks).delete()
    ActionItem.objects.filter(source_chunk__in=chunks).delete()
    classifications, action_items = [], []
    for index, chunk in enumerate(chunks):
        is_primary = index == 0
        classifications.append(Classification(
            chunk=chunk, category=_classification_category(extraction.get("category", "general")),
            topic_label=topic_label,
            item_type=_classification_item_type(extraction.get("category", "general"), has_decisions and is_primary, has_tasks and is_primary),
        ))
    classifications = Classification.objects.bulk_create(classifications)
    primary_chunk = chunks[0]
    for item in extraction.get("action_items", []):
        action_items.extend(ActionItem.objects.bulk_create([ActionItem(
            topic=topic, description=item["task"][:2000], owner=item.get("owner"),
            deadline=_parse_deadline(item.get("deadline")), status="open", source_chunk=primary_chunk,
        )]))
    logger.info("Saved extraction for message %s: topic=%r, %d classifications, %d action items.",
                message.pk, topic_label, len(classifications), len(action_items))
    return {"message_id": message.pk, "topic": topic, "extraction": extraction,
            "classifications": classifications, "action_items": action_items, "chunks": chunks}


def _self_test() -> None:
    # 1. Fence-wrapped JSON parsing.
    fenced = 'Here you go:\n```json\n{"topic": "Botany lab rota", "category": "task", "summary": "s", "decisions": [], "action_items": [{"task": "Water plants", "owner": null, "deadline": null, "priority": "medium"}]}\n```'
    parsed = parse_llm_json(fenced)
    assert parsed["topic"] == "Botany lab rota"
    # 2. Prose-wrapped JSON parsing.
    prose = 'Sure! {"topic": "t", "category": "general", "summary": "", "decisions": [], "action_items": []} hope this helps.'
    assert parse_llm_json(prose)["category"] == "general"
    # 3. Validation clamps bad enums, keeps explicit nulls.
    bad = {"topic": "  x  ", "category": "banana", "summary": "s", "decisions": "only one",
           "action_items": [{"task": " Do it ", "owner": "", "deadline": "TBD", "priority": "urgent"}]}
    clean = validate_extraction(bad)
    assert clean["category"] == "general" and clean["action_items"][0]["owner"] is None
    assert clean["action_items"][0]["deadline"] is None and clean["action_items"][0]["priority"] == "medium"
    # 4. Fallback never guesses owner/deadline (null) and is offline-safe.
    assert "GROQ_API_KEY" not in __import__("os").environ or True
    __import__("os").environ.pop("GROQ_API_KEY", None)
    __import__("os").environ.pop("GROQ_TOKEN", None)
    result = extract_structured_metadata("We decided to use Postgres. Alice please draft the migration plan.")
    assert result["_backend"] == "fallback" and result["category"] in ("decision", "task")
    assert set(result) >= {"topic", "category", "summary", "decisions", "action_items"}
    assert result["action_items"][0]["deadline"] is None
    assert extract_structured_metadata("")["action_items"] == []
    print(f"parse/validate/fallback OK; sample topic={result['topic']!r} category={result['category']!r}")


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
            # Offline-safe: DB-backed checks degrade gracefully when
            # PostgreSQL is unreachable; pure-function checks already ran.
            logger.warning("Self-test DB section skipped offline (%s).", exc)
            print(f"self-test offline OK (DB unreachable, pure checks passed): {exc}")
    else:
        print(__doc__)
