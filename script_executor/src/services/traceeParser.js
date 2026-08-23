const fs = require('fs');
const readline = require('readline');
const logger = require('../utils/logger');

// Known high-risk and signature event names from Aqua Tracee
const SIGNATURE_EVENTS = new Set([
  'anti_debugging',
  'fileless_execution',
  'kernel_module_loading',
  'dynamic_code_loading',
  'sched_debug',
  'sched_debug_recon',
  'illegitimate_shell',
  'ptrace_code_injection',
  'dropped_executable',
  'container_drift',
  'cgroup_release_agent_file_modification',
  'cgroup_release_agent',
  'cgroup_notify_on_release',
  'core_dump_file_modification',
  'hooked_syscall',
  'kallsyms_lookup_name',
  'sudoers_file_modification',
  'sudoers_modification',
  'hidden_file_created',
  'proc_mem_access',
  'proc_mem_code_injection',
  'standard_input_reverse_shell',
  'stdio_over_socket',
  'crypto_miner',
  'ld_preload',
  'aslr_inspection',
]);

// Sensitive filesystem paths for monitoring
const SENSITIVE_PATHS = [
  '/etc/shadow',
  '/etc/passwd',
  '/etc/sudoers',
  '/proc/kcore',
  '/proc/sys',
  '/sys/kernel',
  '/root/.ssh',
  '/root',
  '/dev/mem',
  '/dev/kmem',
];

// Noise filtering: host-level background daemons that should not clutter script alerts
const IGNORED_HOST_PROCESSES = new Set([
  'upowerd',
  'systemd-resolved',
  'systemd-journald',
  'systemd-logind',
  'systemd-udevd',
  'dbus-daemon',
  'rtkit-daemon',
  'polkitd',
]);

class TraceeParser {
  /**
   * Parse Tracee NDJSON output file
   * @param {string} filePath - Path to Tracee log output file
   * @param {Object} options - Filter options (e.g. targetContainerId)
   * @returns {Promise<Array<Object>>} List of parsed alerts/events
   */
  static async parseLogFile(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Tracee log file not found at ${filePath}`);
      return [];
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const parsedEvents = [];

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const rawJson = JSON.parse(trimmed);
        const parsed = this.normalizeEvent(rawJson, options);
        if (parsed) {
          parsedEvents.push(parsed);
        }
      } catch (err) {
        logger.debug(`Skipping unparseable Tracee log line: ${err.message}`, { line: trimmed });
      }
    }

    return parsedEvents;
  }

  /**
   * Parse raw NDJSON string
   * @param {string} rawString
   * @param {Object} options
   * @returns {Array<Object>}
   */
  static parseRawLogs(rawString, options = {}) {
    if (!rawString || typeof rawString !== 'string') return [];

    const lines = rawString.split('\n');
    const parsedEvents = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const rawJson = JSON.parse(trimmed);
        const parsed = this.normalizeEvent(rawJson, options);
        if (parsed) {
          parsedEvents.push(parsed);
        }
      } catch {
        // Ignore malformed lines
      }
    }

    return parsedEvents;
  }

  /**
   * Normalize and classify a raw Tracee JSON event
   * @param {Object} raw
   * @param {Object} options
   * @returns {Object|null}
   */
  static normalizeEvent(raw, options = {}) {
    if (!raw || !raw.eventName) return null;

    const eventName = raw.eventName;
    const processName = raw.processName || '';

    const isSignature = SIGNATURE_EVENTS.has(eventName) || raw.category === 'signatures' || raw.category === 'alerts';

    // Ignore known host daemon noise unless it's a signature security detection
    if (!isSignature && IGNORED_HOST_PROCESSES.has(processName)) {
      return null;
    }
    
    // Extract arguments into clean key-value dictionary
    const args = {};
    if (Array.isArray(raw.args)) {
      for (const arg of raw.args) {
        if (arg && arg.name) {
          args[arg.name] = arg.value;
        }
      }
    }

    // Determine category and severity
    let category = 'system_call';
    let severity = 'INFO';
    let isSecurityAlert = false;

    if (isSignature) {
      category = 'signature_detection';
      severity = this.mapSeverity(raw.metadata?.properties?.Severity || 'HIGH');
      isSecurityAlert = true;
    } else if (eventName.startsWith('net_') || ['connect', 'socket', 'bind', 'accept', 'sendto'].includes(eventName)) {
      category = 'network_activity';
      severity = 'LOW';
    } else if (['execve', 'execveat'].includes(eventName)) {
      category = 'process_execution';
      severity = 'INFO';
    } else if (['ptrace', 'process_vm_writev', 'memfd_create', 'bpf', 'init_module', 'finit_module'].includes(eventName)) {
      category = 'suspicious_syscall';
      severity = 'HIGH';
      isSecurityAlert = true;
    } else if (['openat', 'open', 'security_file_open', 'read', 'write', 'unlink'].includes(eventName)) {
      category = 'file_access';
      const accessedPath = args.pathname || args.path || args.filename || '';
      if (typeof accessedPath === 'string' && SENSITIVE_PATHS.some((p) => accessedPath.startsWith(p))) {
        severity = 'HIGH';
        category = 'sensitive_file_access';
        isSecurityAlert = true;
      }
    }

    // Build normalized alert object
    return {
      timestamp: raw.timestamp ? new Date(raw.timestamp / 1e6).toISOString() : new Date().toISOString(),
      event_id: raw.eventId || raw.eventID || null,
      event_name: eventName,
      category,
      severity,
      is_security_alert: isSecurityAlert,
      description: raw.metadata?.description || this.generateDescription(eventName, args),
      process: {
        name: processName || 'unknown',
        pid: raw.processId || raw.hostProcessId || null,
        ppid: raw.parentProcessId || null,
        user_id: raw.userId ?? null,
      },
      container: {
        id: raw.container?.id || raw.containerId || null,
        name: raw.container?.name || null,
        image: raw.container?.image || null,
      },
      details: {
        return_value: raw.returnValue ?? null,
        args,
        matched_policies: raw.matchedPolicies || [],
        mitre_attack: raw.metadata?.properties?.MitreAttack || null,
      },
    };
  }

  /**
   * Map raw severity to standard levels
   */
  static mapSeverity(val) {
    if (!val) return 'MEDIUM';
    const str = String(val).toUpperCase();
    if (str === '3' || str === 'CRITICAL' || str === 'CRIT') return 'CRITICAL';
    if (str === '2' || str === 'HIGH') return 'HIGH';
    if (str === '1' || str === 'MEDIUM' || str === 'MED') return 'MEDIUM';
    if (str === '0' || str === 'LOW') return 'LOW';
    return str;
  }

  /**
   * Generate human-readable description if metadata is not provided
   */
  static generateDescription(eventName, args) {
    switch (eventName) {
      case 'execve':
      case 'execveat':
        return `Executed command: ${args.pathname || args.filename || 'unknown binary'} with args: ${JSON.stringify(args.argv || [])}`;
      case 'openat':
      case 'open':
      case 'security_file_open':
        return `Accessed file: ${args.pathname || args.path || args.filename || 'unknown'}`;
      case 'ptrace':
        return `Invoked ptrace (request: ${args.request || 'unknown'}) for process debugging/tracing`;
      case 'connect':
        const remoteAddr = typeof args.addr === 'object' && args.addr ? `${args.addr.sin_addr || ''}:${args.addr.sin_port || ''}` : (args.addr || 'remote address');
        return `Attempted network connection to ${remoteAddr}`;
      case 'socket':
        return `Created network socket (domain: ${args.domain}, type: ${args.type})`;
      case 'memfd_create':
        return `Created anonymous in-memory file descriptor (potential fileless execution)`;
      default:
        return `Observed eBPF event ${eventName}`;
    }
  }

  /**
   * Generate summary of parsed events
   */
  static generateSummary(events = []) {
    const summary = {
      total_events: events.length,
      security_alerts_count: 0,
      severity_breakdown: {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        INFO: 0,
      },
      categories: {},
      detected_signatures: [],
    };

    for (const ev of events) {
      if (ev.is_security_alert) {
        summary.security_alerts_count++;
      }

      if (summary.severity_breakdown[ev.severity] !== undefined) {
        summary.severity_breakdown[ev.severity]++;
      }

      summary.categories[ev.category] = (summary.categories[ev.category] || 0) + 1;

      if (ev.category === 'signature_detection' && !summary.detected_signatures.includes(ev.event_name)) {
        summary.detected_signatures.push(ev.event_name);
      }
    }

    return summary;
  }
}

module.exports = TraceeParser;
