#!/bin/bash
# ==========================================================
# [TEST 4] Safe & Clean Workload
# Should NOT touch any honey files
# ==========================================================
echo "[*] Compiling project assets..."
mkdir -p /tmp/build_output
echo "console.log('clean build');" > /tmp/build_output/app.js
ls -la /tmp/build_output
echo "[+] Clean build finished."
