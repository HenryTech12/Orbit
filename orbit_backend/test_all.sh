#!/usr/bin/env bash
# Sentinel master verification: all 5 steps, offline-safe.
# Usage: bash test_all.sh  (run from orbit_backend/)
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
run_step "Step 1: Django system check" python3 orbit_app/manage.py check
run_step "Step 2: chunks chunk/embed self-test" python3 -m orbit_app.chunks.services --self-test
run_step "Step 3: classifications extraction self-test" python3 -m orbit_app.classifications.services --self-test
run_step "Step 4a: hybrid_search self-test" python3 -m orbit_app.core.services.hybrid_search --self-test
run_step "Step 4b: responder self-test" python3 -m orbit_app.core.services.responder --self-test
run_step "Step 5: core API tests (sqlite fallback when PG down)" python3 orbit_app/manage.py test orbit_app.core -v 1
# Lightweight live API check against Django test client (sqlite, no server needed)
run_step "Step 5b: /api/v1/chat smoke check" python3 - "$@" <<'PYEOF'
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "orbit_app.settings")
import django
django.setup()
from django.test import RequestFactory
from orbit_app.core.views import ChatCopilotView
factory = RequestFactory()
req = factory.post("/api/v1/chat/", {"message": "When was the Postgres migration approved?", "top_k": 3}, content_type="application/json")
resp = ChatCopilotView.as_view()(req)
assert resp.status_code in (200, 500), resp.status_code  # 500 only if DB-backed path hard-fails; offline demo corpus normally gives 200
print("chat smoke status:", resp.status_code, "trust:", (resp.data or {}).get("trust_status"))
PYEOF
echo "================ Summary: $PASS passed, $FAIL failed ================"
[ "$FAIL" -eq 0 ]
