#!/bin/bash
# ==============================================================================
# Total Integration Test Suite for HoneyFile Trap System
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================================================"
echo "          🍯 RUNNING TOTAL INTEGRATION TEST SUITE                      "
echo "========================================================================"

# Step 1: Verify Docker honeypot image & smoke tests
echo ""
echo "[Step 1/5] Verifying sandbox-honeypot:latest image & smoke tests..."
"$ROOT_DIR/script_executor/docker/test_honeypot_image.sh"

# Step 2: Run script_executor Jest test suites (including honeyFile integration)
echo ""
echo "[Step 2/5] Running Script Executor Jest test suites..."
(cd "$ROOT_DIR/script_executor" && npm test)

# Step 3: Run Python Backend Pytest suites
echo ""
echo "[Step 3/5] Running Python Backend tests (HoneyFile verdicts & invariants)..."
(cd "$ROOT_DIR" && PYTHONPATH=backend backend/.venv/bin/pytest \
  backend/tests/test_honeyfile_verdict.py \
  backend/tests/test_script_analysis.py \
  backend/tests/test_security_invariants.py -v)

# Step 4: Validate standalone test scripts exist and are executable
echo ""
echo "[Step 4/5] Checking dedicated test scripts..."
for script in "$SCRIPT_DIR"/test_*.sh; do
  if [ -x "$script" ]; then
    echo "✓ Executable: $(basename "$script")"
  else
    echo "✗ Not executable: $(basename "$script")"
    exit 1
  fi
done

# Step 5: Test Frontend Production Build
echo ""
echo "[Step 5/5] Testing Frontend Vite production build..."
(cd "$ROOT_DIR/frontend" && npm run build)

echo ""
echo "========================================================================"
echo "      ✅ ALL TOTAL INTEGRATION TESTS PASSED SUCCESSFULLY!               "
echo "========================================================================"
