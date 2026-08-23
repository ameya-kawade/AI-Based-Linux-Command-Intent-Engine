const TraceeParser = require('../src/services/traceeParser');

describe('Security Scenarios - Tracee eBPF Event Classification', () => {
  describe('1. Privilege Escalation & Security Boundary Alerts', () => {
    const privEscLog = JSON.stringify({
      timestamp: 1672531200000000,
      processId: 1050,
      processName: 'sudo_exploit',
      eventName: 'sudoers_modification',
      category: 'signatures',
      metadata: {
        description: 'Attempted modification of sudoers configuration file detected',
        properties: { Severity: '3', MitreAttack: 'T1548.003' },
      },
      args: [{ name: 'pathname', value: '/etc/sudoers' }],
    });

    it('should classify sudoers modification as a CRITICAL security alert', () => {
      const events = TraceeParser.parseRawLogs(privEscLog);
      expect(events.length).toBe(1);
      expect(events[0].event_name).toBe('sudoers_modification');
      expect(events[0].category).toBe('signature_detection');
      expect(events[0].severity).toBe('CRITICAL');
      expect(events[0].is_security_alert).toBe(true);
      expect(events[0].details.mitre_attack).toBe('T1548.003');
    });

    const cgroupEscapeLog = JSON.stringify({
      timestamp: 1672531201000000,
      processId: 1055,
      processName: 'sh',
      eventName: 'cgroup_release_agent',
      category: 'signatures',
      metadata: {
        description: 'Container escape attempt via cgroup release_agent modification',
        properties: { Severity: 'CRITICAL', MitreAttack: 'T1611' },
      },
    });

    it('should classify cgroup release agent container escape as CRITICAL', () => {
      const events = TraceeParser.parseRawLogs(cgroupEscapeLog);
      expect(events.length).toBe(1);
      expect(events[0].severity).toBe('CRITICAL');
      expect(events[0].is_security_alert).toBe(true);
      expect(events[0].description).toContain('cgroup');
    });
  });

  describe('2. Network & Socket Connection Telemetry (e.g. Reverse Shell Indicators)', () => {
    const socketOverStdioLog = JSON.stringify({
      timestamp: 1672531202000000,
      processId: 1060,
      processName: 'bash',
      eventName: 'stdio_over_socket',
      category: 'signatures',
      metadata: {
        description: 'Standard I/O redirected over network socket (reverse shell behavior)',
        properties: { Severity: '3', MitreAttack: 'T1059.004' },
      },
      args: [{ name: 'fd', value: 0 }, { name: 'socket', value: 3 }],
    });

    it('should detect stdio_over_socket as a reverse shell signature', () => {
      const events = TraceeParser.parseRawLogs(socketOverStdioLog);
      expect(events.length).toBe(1);
      expect(events[0].event_name).toBe('stdio_over_socket');
      expect(events[0].category).toBe('signature_detection');
      expect(events[0].severity).toBe('CRITICAL');
      expect(events[0].is_security_alert).toBe(true);
    });

    const outboundConnectLog = JSON.stringify({
      timestamp: 1672531203000000,
      processId: 1062,
      processName: 'curl',
      eventName: 'connect',
      args: [{ name: 'addr', value: '198.51.100.25:4444' }],
    });

    it('should classify outbound network connections under network_activity', () => {
      const events = TraceeParser.parseRawLogs(outboundConnectLog);
      expect(events.length).toBe(1);
      expect(events[0].category).toBe('network_activity');
      expect(events[0].severity).toBe('LOW');
      expect(events[0].description).toContain('198.51.100.25:4444');
    });
  });

  describe('3. Sensitive Credential Access & Reconnaissance', () => {
    const shadowAccessLog = JSON.stringify({
      timestamp: 1672531204000000,
      processId: 1070,
      processName: 'cat',
      eventName: 'openat',
      args: [{ name: 'pathname', value: '/etc/shadow' }],
    });

    it('should classify access to /etc/shadow as sensitive_file_access with HIGH severity', () => {
      const events = TraceeParser.parseRawLogs(shadowAccessLog);
      expect(events.length).toBe(1);
      expect(events[0].category).toBe('sensitive_file_access');
      expect(events[0].severity).toBe('HIGH');
      expect(events[0].is_security_alert).toBe(true);
    });
  });

  describe('4. Anti-Debugging & Code Injection Telemetry', () => {
    const ptraceLog = JSON.stringify({
      timestamp: 1672531205000000,
      processId: 1080,
      processName: 'injector',
      eventName: 'ptrace',
      args: [{ name: 'request', value: 'PTRACE_ATTACH' }],
    });

    it('should flag suspicious ptrace syscalls with HIGH severity', () => {
      const events = TraceeParser.parseRawLogs(ptraceLog);
      expect(events.length).toBe(1);
      expect(events[0].category).toBe('suspicious_syscall');
      expect(events[0].severity).toBe('HIGH');
      expect(events[0].is_security_alert).toBe(true);
    });
  });
});
