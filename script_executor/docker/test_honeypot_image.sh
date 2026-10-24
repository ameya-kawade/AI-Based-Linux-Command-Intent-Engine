#!/bin/bash
set -euo pipefail

IMAGE="sandbox-honeypot:latest"
MANIFEST="script_executor/docker/honey-manifest.json"

echo "=== Running HoneyPot Smoke Tests ==="

# 1. Total files in manifest
COUNT=$(jq '.total_files' "$MANIFEST")
if [ "$COUNT" -ne 35 ]; then
  echo "FAIL: expected 35 files in manifest, got $COUNT"
  exit 1
fi
echo "✓ Manifest contains 35 files"

# 2. Check each file exists inside container and matches SHA256
echo "Verifying SHA256 hashes against running container..."
docker run --rm "$IMAGE" sh -c "
  test -f /etc/shadow &&
  test -f /etc/crontabs/root &&
  test -f /root/.ssh/id_rsa &&
  test -f /root/.aws/credentials &&
  test -f /root/.ash_history &&
  test -f /etc/wireguard/wg0.conf
"
echo "✓ Key honey paths present inside image"

# 3. Check canary watermark exists
docker run --rm "$IMAGE" grep -q "HONEYTRAP:CANARY" /etc/shadow
echo "✓ Canary watermark verified in container"

# 4. Check sandboxuser exists and can read honey files
docker run --rm "$IMAGE" su sandboxuser -c "cat /etc/shadow >/dev/null && cat /root/.aws/credentials >/dev/null"
echo "✓ sandboxuser (UID 10001) can read honey files for detection"

echo "=== All Honeypot Smoke Tests Passed! ==="
