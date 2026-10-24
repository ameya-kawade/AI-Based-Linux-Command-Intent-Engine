#!/bin/bash
# Builds the sandbox-honeypot image and generates the SHA-256 hash manifest

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="sandbox-honeypot:latest"
MANIFEST_FILE="$SCRIPT_DIR/honey-manifest.json"

echo "Building $IMAGE_NAME..."
docker build -t "$IMAGE_NAME" -f "$SCRIPT_DIR/Dockerfile.honeypot" "$SCRIPT_DIR"

echo "Generating honey file hash manifest..."

# All 35 honey file paths — must match HONEY_FILE_PATHS in honeyFileService.js
HONEY_PATHS=(
  # Tier 1: CRITICAL
  "/etc/shadow"
  "/etc/sudoers"
  "/root/.ssh/id_rsa"
  "/root/.ssh/id_ed25519"
  "/root/.ssh/id_ecdsa"
  "/root/.aws/credentials"
  "/root/.kube/config"
  "/root/.gnupg/private-keys-v1.d/DEADBEEF.key"
  "/etc/ssl/private/server.key"
  "/etc/ssh/ssh_host_rsa_key"
  "/etc/ssh/ssh_host_ed25519_key"
  # Tier 2: HIGH
  "/etc/gshadow"
  "/root/.ssh/authorized_keys"
  "/root/.ssh/config"
  "/root/.docker/config.json"
  "/root/.env"
  "/root/.git-credentials"
  "/root/.pgpass"
  "/root/.netrc"
  "/root/.npmrc"
  "/root/.pypirc"
  "/root/.config/gcloud/application_default_credentials.json"
  "/root/.azure/accessTokens.json"
  "/root/.terraform.d/credentials.tfrc.json"
  "/root/.vault-token"
  "/etc/crontabs/root"
  "/root/.mysql_history"
  "/root/.config/gh/hosts.yml"
  "/etc/wireguard/wg0.conf"
  # Tier 3: MEDIUM
  "/root/.ssh/known_hosts"
  "/root/.ash_history"
  "/root/.bash_history"
  "/root/.gitconfig"
  "/root/.aws/config"
  "/etc/security/opasswd"
)

# Generate hashes inside the container to ensure byte-exact matching
HASH_CMD=""
for p in "${HONEY_PATHS[@]}"; do
  HASH_CMD+="sha256sum '$p' 2>/dev/null || echo 'MISSING $p'; "
done

RAW_OUTPUT=$(docker run --rm "$IMAGE_NAME" sh -c "$HASH_CMD")

# Parse into JSON manifest
echo "{" > "$MANIFEST_FILE"
echo '  "version": "2.0.0",' >> "$MANIFEST_FILE"
echo '  "image": "'"$IMAGE_NAME"'",' >> "$MANIFEST_FILE"
echo '  "total_files": '"${#HONEY_PATHS[@]}"',' >> "$MANIFEST_FILE"
echo "  \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$MANIFEST_FILE"
echo '  "files": {' >> "$MANIFEST_FILE"

FIRST=true
while IFS= read -r line; do
  if [[ "$line" == MISSING* ]]; then
    echo "  WARNING: $line" >&2
    continue
  fi
  HASH=$(echo "$line" | awk '{print $1}')
  FPATH=$(echo "$line" | awk '{print $2}')
  if [ -z "$HASH" ] || [ -z "$FPATH" ]; then
    continue
  fi
  if [ "$FIRST" = true ]; then FIRST=false; else echo "," >> "$MANIFEST_FILE"; fi
  printf '    "%s": "%s"' "$FPATH" "$HASH" >> "$MANIFEST_FILE"
done <<< "$RAW_OUTPUT"

echo "" >> "$MANIFEST_FILE"
echo "  }" >> "$MANIFEST_FILE"
echo "}" >> "$MANIFEST_FILE"

echo "Manifest written to $MANIFEST_FILE (${#HONEY_PATHS[@]} files)"
echo "Image $IMAGE_NAME built successfully."
