const SandboxService = require('../src/services/sandboxService');

// Define a suite of safe test cases representing different behavioral patterns
const testCases = [
  {
    name: '1. Safe Benign Execution',
    description: 'Verifies standard command execution, process spawning, and normal system calls.',
    script: `
echo "=== System Info ==="
uname -a
whoami
date
ls -la /tmp
`,
  },
  {
    name: '2. Sensitive File Access Audit',
    description: 'Attempts to access restricted sensitive paths (/etc/shadow, /etc/passwd) to verify file_access and sensitive_file_access detection.',
    script: `
echo "=== Testing Sensitive File Access ==="
cat /etc/shadow 2>&1 || echo "Access to /etc/shadow denied (expected)"
cat /etc/passwd | head -n 5
`,
  },
  {
    name: '3. Privilege Boundary & Capability Inspection',
    description: 'Audits UID/GID and verifies container isolation boundaries (no-new-privileges and cap-drop enforcement).',
    script: `
echo "=== Testing Privilege Boundaries ==="
id
# Attempting setuid/su commands to confirm cap-drop isolation
su - nobody 2>&1 || echo "su dropped/restricted as expected"
test -w /proc/sys/kernel && echo "Kernel tunable writable (UNSAFE)" || echo "Kernel tunable read-only (SECURE)"
`,
  },
  {
    name: '4. Network Socket Telemetry Probe',
    description: 'Tests network socket creation and outbound connect attempt telemetry using safe local loopback checks.',
    script: `
echo "=== Testing Network Activity Detection ==="
# Attempt a safe loopback socket probe
nc -z -w 1 127.0.0.1 8080 2>&1 || true
wget -q -T 1 -O - http://127.0.0.1:8080 2>&1 || echo "Loopback connection handled"
`,
  },
  {
    name: '5. Resource Limit / Denial-of-Service Containment',
    description: 'Spawns background processes to verify PID limit containment and timeout safeguards.',
    script: `
echo "=== Testing Process & Concurrency Limits ==="
for i in $(seq 1 20); do
  (sleep 0.2) &
done
wait
echo "Spawned and reaped processes successfully within PID limits."
`,
  },
  {
    name: '6. Execution Timeout Safeguard (Infinite Loop)',
    description: 'Verifies that runaway or hanging scripts are terminated strictly at the 10-second limit.',
    script: `
echo "=== Testing Infinite Loop Containment ==="
echo "Entering loop; should be killed by sandbox timeout..."
while true; do
  sleep 1
done
`,
  },
];

async function runSecurityTestSuite() {
  console.log('================================================================');
  console.log('       SANDBOX & TRACEE eBPF SECURITY TELEMETRY TEST SUITE      ');
  console.log('================================================================\n');

  for (const test of testCases) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[TEST] ${test.name}`);
    console.log(`[DESC] ${test.description}`);
    console.log(`----------------------------------------------------------------`);

    const startTime = Date.now();
    try {
      const result = await SandboxService.executeAndAnalyze(test.script);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`Execution Status  : ${result.status.toUpperCase()}`);
      console.log(`Exit Code         : ${result.metadata?.exit_code}`);
      console.log(`Timed Out         : ${result.metadata?.timed_out ? 'YES (Strict Timeout Enforced)' : 'NO'}`);
      console.log(`Duration          : ${elapsed}s`);
      console.log(`\nScript Output:\n${result.script_output ? result.script_output.trim() : '[No Output]'}`);

      const summary = result.metadata?.summary;
      if (summary) {
        console.log(`\nTracee eBPF Telemetry:`);
        console.log(`  - Total Captured Events : ${summary.total_events}`);
        console.log(`  - Security Alerts Count : ${summary.security_alerts_count}`);
        console.log(`  - Severity Breakdown    :`, JSON.stringify(summary.severity_breakdown));
        console.log(`  - Categories Breakdown  :`, JSON.stringify(summary.categories));
        if (summary.detected_signatures.length > 0) {
          console.log(`  - Detected Signatures   :`, summary.detected_signatures.join(', '));
        }
      }

      if (result.tracee_alerts && result.tracee_alerts.length > 0) {
        const securityAlerts = result.tracee_alerts.filter((a) => a.is_security_alert);
        if (securityAlerts.length > 0) {
          console.log(`\nSample Flagged Security Alerts (${securityAlerts.length} total):`);
          securityAlerts.slice(0, 3).forEach((alert, idx) => {
            console.log(`  [${idx + 1}] Event: ${alert.event_name} | Category: ${alert.category} | Severity: ${alert.severity}`);
            console.log(`      Description: ${alert.description}`);
            console.log(`      Process: ${alert.process?.name} (PID: ${alert.process?.pid})`);
          });
        }
      }
    } catch (err) {
      console.error(`Test execution encountered an error: ${err.message}`);
    }
  }

  console.log('\n================================================================');
  console.log('                ALL SECURITY TEST CASES COMPLETED               ');
  console.log('================================================================\n');
}

runSecurityTestSuite().catch(console.error);
