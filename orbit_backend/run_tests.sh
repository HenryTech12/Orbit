#!/usr/bin/env bash
# Sentinel test runner — Team Orbit (UniPods Hackathon 2026).
# Runs all module self-tests, the Django test suite, and an end-to-end
# database shell test (message_id=999 -> trust_status "verified").
# Usage: ./run_tests.sh   (run from orbit_backend/)
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-orbit_app.settings}"
export PYTHONPATH="${PYTHONPATH:-orbit_app}"
PASS=0; FAIL=0
run_step() {
  local label="$1"; shift
  echo "=== $label ==="
  echo "\$ $*"
  if "$@"; then echo "PASS: $label"; PASS=$((PASS+1)); else echo "FAIL: $label"; FAIL=$((FAIL+1)); fi
  echo
}
run_step "chunks self-test (Step 2)" python3 -m orbit_app.chunks.services --self-test
run_step "classifications self-test (Step 3)" python3 -m orbit_app.classifications.services --self-test
run_step "hybrid_search self-test (Step 4)" python3 -m orbit_app.core.services.hybrid_search --self-test
run_step "responder self-test (Step 4)" python3 -m orbit_app.core.services.responder --self-test
run_step "Django test suite (Step 5)" python3 orbit_app/manage.py test orbit_app.core -v 1
# End-to-end DB shell test: migrate sqlite dev DB, seed message_id=999, assert verified.
run_step "DB migrate (sqlite dev fallback)" python3 orbit_app/manage.py migrate --run-syncdb
run_step "DB shell test: message_id=999 -> verified" python3 orbit_app/manage.py shell <<'PYEOF'
from django.utils import timezone
from orbit_app.messages.models import Message
from orbit_app.chunks.services import ingest_message_chunks
from orbit_app.core.services.responder import generate_grounded_response
# NOTE: Message PK is message_id (BigAutoField) — never `id`.
msg, created = Message.objects.get_or_create(
    message_id=999,
    defaults={
        "source_type": "pdf",
        "sender": "PMO",
        "timestamp": timezone.now(),
        "raw_text": "Official decision: the Postgres migration was approved for Friday. Ada to draft the migration plan.",
        "authority_level": "official",
    },
)
print(f"seed message_id={msg.message_id} (created={created})")
chunks = ingest_message_chunks(message=msg)
assert len(chunks) >= 1, "expected >=1 chunk persisted"
assert len(chunks[0].embedding) == 384, "expected 384-d embeddings"
result = generate_grounded_response("When was the Postgres migration approved?")
print("trust_status:", result["trust_status"])
print("answer:", result["answer"][:200])
assert result["trust_status"] == "verified", f"expected verified, got {result['trust_status']}: {result}"
assert "Postgres" in result["answer"] and "Friday" in result["answer"]
print("DB shell test OK: message_id=999 -> verified")
PYEOF
echo "================ Summary: $PASS passed, $FAIL failed ================"
[ "$FAIL" -eq 0 ]
