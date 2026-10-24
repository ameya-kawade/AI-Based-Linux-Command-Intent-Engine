const TraceeParser = require('../src/services/traceeParser');

describe('TraceeParser', () => {
  const sampleNdjson = `
{"timestamp":1672531199000000,"processId":123,"processName":"sh","eventName":"execve","args":[{"name":"pathname","value":"/bin/ls"},{"name":"argv","value":["ls","-la"]}]}
{"timestamp":1672531200000000,"processId":123,"processName":"cat","eventName":"openat","args":[{"name":"pathname","value":"/etc/shadow"},{"name":"flags","value":"O_RDONLY"}]}
{"timestamp":1672531201000000,"processId":124,"processName":"malware","eventName":"anti_debugging","category":"signatures","metadata":{"description":"Process detected anti-debugging via ptrace","properties":{"Severity":"3"}},"args":[{"name":"request","value":"PTRACE_TRACEME"}]}
{"timestamp":1672531202000000,"processId":125,"processName":"curl","eventName":"connect","args":[{"name":"addr","value":"198.51.100.1:4444"}]}
{"timestamp":1672531203000000,"processId":126,"processName":"cat","eventName":"openat","args":[{"name":"pathname","value":"/proc/kcore"}]}
`;

  it('should correctly parse NDJSON string into normalized alert objects', () => {
    const events = TraceeParser.parseRawLogs(sampleNdjson);
    expect(events.length).toBe(5);

    // 1. Process execution
    expect(events[0].event_name).toBe('execve');
    expect(events[0].category).toBe('process_execution');
    expect(events[0].is_security_alert).toBe(false);

    // 2. Honey file access (/etc/shadow takes priority as CRITICAL honey_file_access)
    expect(events[1].event_name).toBe('openat');
    expect(events[1].category).toBe('honey_file_access');
    expect(events[1].severity).toBe('CRITICAL');
    expect(events[1].is_security_alert).toBe(true);

    // 3. Signature detection
    expect(events[2].event_name).toBe('anti_debugging');
    expect(events[2].category).toBe('signature_detection');
    expect(events[2].severity).toBe('CRITICAL');
    expect(events[2].is_security_alert).toBe(true);
    expect(events[2].description).toContain('anti-debugging');

    // 4. Network activity
    expect(events[3].event_name).toBe('connect');
    expect(events[3].category).toBe('network_activity');

    // 5. Non-honey sensitive file access (/proc/kcore)
    expect(events[4].event_name).toBe('openat');
    expect(events[4].category).toBe('sensitive_file_access');
    expect(events[4].severity).toBe('HIGH');
    expect(events[4].is_security_alert).toBe(true);
  });

  it('should generate accurate summary statistics', () => {
    const events = TraceeParser.parseRawLogs(sampleNdjson);
    const summary = TraceeParser.generateSummary(events);

    expect(summary.total_events).toBe(5);
    expect(summary.security_alerts_count).toBe(3);
    expect(summary.severity_breakdown.CRITICAL).toBe(2); // honey_file_access + anti_debugging
    expect(summary.severity_breakdown.HIGH).toBe(1);     // /proc/kcore
    expect(summary.detected_signatures).toContain('anti_debugging');
  });

  it('should handle empty or malformed strings gracefully', () => {
    expect(TraceeParser.parseRawLogs('')).toEqual([]);
    expect(TraceeParser.parseRawLogs('not-a-json-string\n{broken')).toEqual([]);
  });

  it('should normalize Docker overlay2 and procfs paths in Tracee events to detect honey file access', () => {
    const overlayNdjson = `
{"timestamp":1672531200000000,"processId":123,"processName":"cat","eventName":"openat","args":[{"name":"pathname","value":"/var/lib/docker/overlay2/d3e123/merged/root/.ssh/id_rsa"},{"name":"flags","value":"O_RDONLY"}]}
{"timestamp":1672531201000000,"processId":124,"processName":"cat","eventName":"openat","args":[{"name":"pathname","value":"/proc/999/root/etc/shadow"},{"name":"flags","value":"O_RDONLY"}]}
`;
    const events = TraceeParser.parseRawLogs(overlayNdjson);
    expect(events.length).toBe(2);

    expect(events[0].category).toBe('honey_file_access');
    expect(events[0].severity).toBe('CRITICAL');
    expect(events[0].is_security_alert).toBe(true);

    expect(events[1].category).toBe('honey_file_access');
    expect(events[1].severity).toBe('CRITICAL');
    expect(events[1].is_security_alert).toBe(true);
  });
});
