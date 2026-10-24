const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════════════════
// All 35 honey file paths — SINGLE SOURCE OF TRUTH
// Paths verified against Alpine Linux (alpine:latest) filesystem
// ═══════════════════════════════════════════════════════════════════
const HONEY_FILE_PATHS = [
  // ── Tier 1: CRITICAL — Immediate credential compromise ──
  '/etc/shadow',
  '/etc/sudoers',
  '/root/.ssh/id_rsa',
  '/root/.ssh/id_ed25519',
  '/root/.ssh/id_ecdsa',
  '/root/.aws/credentials',
  '/root/.kube/config',
  '/root/.gnupg/private-keys-v1.d/DEADBEEF.key',
  '/etc/ssl/private/server.key',
  '/etc/ssh/ssh_host_rsa_key',
  '/etc/ssh/ssh_host_ed25519_key',

  // ── Tier 2: HIGH — Sensitive credential & config files ──
  '/etc/gshadow',
  '/root/.ssh/authorized_keys',
  '/root/.ssh/config',
  '/root/.docker/config.json',
  '/root/.env',
  '/root/.git-credentials',
  '/root/.pgpass',
  '/root/.netrc',
  '/root/.npmrc',
  '/root/.pypirc',
  '/root/.config/gcloud/application_default_credentials.json',
  '/root/.azure/accessTokens.json',
  '/root/.terraform.d/credentials.tfrc.json',
  '/root/.vault-token',
  '/etc/crontabs/root',
  '/root/.mysql_history',
  '/root/.config/gh/hosts.yml',
  '/etc/wireguard/wg0.conf',

  // ── Tier 3: MEDIUM — Reconnaissance & history files ──
  '/root/.ssh/known_hosts',
  '/root/.ash_history',
  '/root/.bash_history',
  '/root/.gitconfig',
  '/root/.aws/config',
  '/etc/security/opasswd',
];

// ═══════════════════════════════════════════════════════════════════
// Category + severity + MITRE mapping for each honey file
// ═══════════════════════════════════════════════════════════════════
const HONEY_FILE_CATEGORIES = {
  // Tier 1: CRITICAL
  '/etc/shadow':                { category: 'password_hash_theft',       severity: 'CRITICAL', mitre: 'T1003.008', tier: 1 },
  '/etc/sudoers':               { category: 'privilege_escalation',      severity: 'CRITICAL', mitre: 'T1548.003', tier: 1 },
  '/root/.ssh/id_rsa':          { category: 'ssh_credential_theft',      severity: 'CRITICAL', mitre: 'T1552.004', tier: 1 },
  '/root/.ssh/id_ed25519':      { category: 'ssh_credential_theft',      severity: 'CRITICAL', mitre: 'T1552.004', tier: 1 },
  '/root/.ssh/id_ecdsa':        { category: 'ssh_credential_theft',      severity: 'CRITICAL', mitre: 'T1552.004', tier: 1 },
  '/root/.aws/credentials':     { category: 'cloud_credential_theft',    severity: 'CRITICAL', mitre: 'T1552.001', tier: 1 },
  '/root/.kube/config':         { category: 'k8s_cluster_takeover',      severity: 'CRITICAL', mitre: 'T1552.001', tier: 1 },
  '/root/.gnupg/private-keys-v1.d/DEADBEEF.key': { category: 'encryption_key_theft', severity: 'CRITICAL', mitre: 'T1552.004', tier: 1 },
  '/etc/ssl/private/server.key':    { category: 'tls_key_theft',         severity: 'CRITICAL', mitre: 'T1552.004', tier: 1 },
  '/etc/ssh/ssh_host_rsa_key':      { category: 'host_key_theft',        severity: 'CRITICAL', mitre: 'T1552.004', tier: 1 },
  '/etc/ssh/ssh_host_ed25519_key':  { category: 'host_key_theft',        severity: 'CRITICAL', mitre: 'T1552.004', tier: 1 },

  // Tier 2: HIGH
  '/etc/gshadow':               { category: 'password_hash_theft',       severity: 'HIGH',     mitre: 'T1003.008', tier: 2 },
  '/root/.ssh/authorized_keys': { category: 'ssh_persistence',           severity: 'HIGH',     mitre: 'T1098.004', tier: 2 },
  '/root/.ssh/config':          { category: 'ssh_lateral_movement',      severity: 'HIGH',     mitre: 'T1018',     tier: 2 },
  '/root/.docker/config.json':  { category: 'registry_token_theft',      severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/root/.env':                 { category: 'api_secret_theft',          severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/root/.git-credentials':     { category: 'scm_credential_theft',      severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/root/.pgpass':              { category: 'db_credential_theft',       severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/root/.netrc':               { category: 'network_credential_theft',  severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/root/.npmrc':               { category: 'package_registry_theft',    severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/root/.pypirc':              { category: 'package_registry_theft',    severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/root/.config/gcloud/application_default_credentials.json': { category: 'cloud_credential_theft', severity: 'HIGH', mitre: 'T1552.001', tier: 2 },
  '/root/.azure/accessTokens.json':       { category: 'cloud_credential_theft',    severity: 'HIGH', mitre: 'T1552.001', tier: 2 },
  '/root/.terraform.d/credentials.tfrc.json': { category: 'iac_credential_theft', severity: 'HIGH', mitre: 'T1552.001', tier: 2 },
  '/root/.vault-token':         { category: 'secrets_manager_theft',     severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/etc/crontabs/root':         { category: 'cron_persistence',          severity: 'HIGH',     mitre: 'T1053.003', tier: 2 },
  '/root/.mysql_history':       { category: 'db_credential_recon',       severity: 'HIGH',     mitre: 'T1552.003', tier: 2 },
  '/root/.config/gh/hosts.yml': { category: 'scm_credential_theft',      severity: 'HIGH',     mitre: 'T1552.001', tier: 2 },
  '/etc/wireguard/wg0.conf':    { category: 'vpn_credential_theft',      severity: 'HIGH',     mitre: 'T1552.004', tier: 2 },

  // Tier 3: MEDIUM
  '/root/.ssh/known_hosts':     { category: 'lateral_movement_recon',    severity: 'MEDIUM',   mitre: 'T1018',     tier: 3 },
  '/root/.ash_history':         { category: 'history_exfiltration',      severity: 'MEDIUM',   mitre: 'T1552.003', tier: 3 },
  '/root/.bash_history':        { category: 'history_exfiltration',      severity: 'MEDIUM',   mitre: 'T1552.003', tier: 3 },
  '/root/.gitconfig':           { category: 'developer_recon',           severity: 'MEDIUM',   mitre: 'T1552.001', tier: 3 },
  '/root/.aws/config':          { category: 'cloud_recon',               severity: 'MEDIUM',   mitre: 'T1580',     tier: 3 },
  '/etc/security/opasswd':      { category: 'historical_password_theft', severity: 'MEDIUM',   mitre: 'T1003.008', tier: 3 },
};

class HoneyFileService {
  constructor() {
    this._manifest = null;
  }

  /** Load the pre-built hash manifest from disk */
  loadManifest() {
    if (this._manifest) return this._manifest;

    const manifestPath = config.honeyFile && config.honeyFile.manifestPath
      ? config.honeyFile.manifestPath
      : require('path').join(__dirname, '../../docker/honey-manifest.json');

    if (!fs.existsSync(manifestPath)) {
      logger.warn(`Honey file manifest not found at ${manifestPath}`);
      return null;
    }

    try {
      this._manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      logger.info(`Loaded honey file manifest v${this._manifest.version} with ${Object.keys(this._manifest.files || {}).length} files`);
      return this._manifest;
    } catch (err) {
      logger.error(`Failed to parse honey file manifest: ${err.message}`);
      return null;
    }
  }

  /**
   * Normalize host or overlay filesystem paths to in-container paths.
   * Handles Docker overlay2 (merged/diff), overlayfs, procfs root, and container rootfs paths.
   * @param {string} rawPath - Raw path observed by Tracee/host
   * @returns {string} In-container normalized path
   */
  static normalizeContainerPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    let p = rawPath.trim();

    // 1. Procfs root link: /proc/(self|\d+)/root/path
    const procMatch = p.match(/\/proc\/(?:self|\d+)\/root(\/.*)/);
    if (procMatch) {
      return path.posix.normalize(procMatch[1]);
    }

    // 2. Overlay2 merged or diff: /var/lib/docker/overlay2/<hash>/(merged|diff)/path
    const overlay2MergedMatch = p.match(/\/overlay2\/[^/]+\/(?:merged|diff)(\/.*)/);
    if (overlay2MergedMatch) {
      return path.posix.normalize(overlay2MergedMatch[1]);
    }

    // 3. Overlay2 general: /overlay2/<hash>/path
    const overlay2Match = p.match(/\/overlay2\/[^/]+(\/.*)/);
    if (overlay2Match) {
      return path.posix.normalize(overlay2Match[1]);
    }

    // 4. OverlayFS: /overlayfs/<hash>/path or /overlayfs/<hash>/merged/path
    const overlayfsMatch = p.match(/\/overlayfs\/[^/]+(?:\/merged)?(\/.*)/);
    if (overlayfsMatch) {
      return path.posix.normalize(overlayfsMatch[1]);
    }

    // 5. Rootfs patterns: /docker/rootfs/path or /rootfs/path
    const rootfsMatch = p.match(/\/(?:docker\/)?rootfs(\/.*)/);
    if (rootfsMatch) {
      return path.posix.normalize(rootfsMatch[1]);
    }

    return path.posix.normalize(p);
  }

  /** Get the list of all honey file paths */
  static getPaths() {
    return [...HONEY_FILE_PATHS];
  }

  /**
   * Compare post-execution hashes against the manifest.
   * @param {string} rawHashOutput - Output from `sha256sum` run inside the container
   * @returns {{ modified: string[], deleted: string[], intact: string[], error?: string }}
   */
  compareHashes(rawHashOutput) {
    const manifest = this.loadManifest();
    if (!manifest || !manifest.files) {
      return { modified: [], deleted: [], intact: [], error: 'Manifest not loaded' };
    }

    const postHashes = {};
    const deletedFiles = [];

    if (rawHashOutput) {
      for (const line of rawHashOutput.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('DELETED ')) {
          deletedFiles.push(trimmed.replace('DELETED ', '').trim());
          continue;
        }

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          postHashes[parts[1]] = parts[0];
        }
      }
    }

    const modified = [];
    const intact = [];

    for (const [filePath, expectedHash] of Object.entries(manifest.files)) {
      if (deletedFiles.includes(filePath)) {
        modified.push(filePath); // Deletion counts as modification
      } else if (postHashes[filePath] && postHashes[filePath] !== expectedHash) {
        modified.push(filePath);
      } else if (postHashes[filePath] === expectedHash) {
        intact.push(filePath);
      }
    }

    return { modified, deleted: deletedFiles, intact };
  }

  /**
   * Scan parsed Tracee alerts for honey file access events.
   * @param {Array} parsedAlerts - Array of normalized Tracee events
   * @returns {{ accessed: Array<{ path, event_name, process_name, category, severity, mitre, tier }> }}
   */
  scanTraceeForHoneyAccess(parsedAlerts) {
    const accessed = [];
    const seenPaths = new Set();

    if (!Array.isArray(parsedAlerts)) return { accessed };

    for (const alert of parsedAlerts) {
      const args = alert.details && alert.details.args ? alert.details.args : {};
      const rawPath = args.pathname || args.path || args.filename || '';

      if (!rawPath || typeof rawPath !== 'string') continue;

      // Normalize host / overlayfs / overlay2 / procfs paths from Tracee
      const accessedPath = HoneyFileService.normalizeContainerPath(rawPath);

      for (const honeyPath of HONEY_FILE_PATHS) {
        if (accessedPath === honeyPath || accessedPath.startsWith(honeyPath + '/')) {
          if (!seenPaths.has(honeyPath)) {
            seenPaths.add(honeyPath);
            const cat = HONEY_FILE_CATEGORIES[honeyPath] || {};
            accessed.push({
              path: honeyPath,
              event_name: alert.event_name,
              process_name: (alert.process && alert.process.name) ? alert.process.name : 'unknown',
              category: cat.category || 'unknown',
              severity: cat.severity || 'HIGH',
              mitre: cat.mitre || null,
              tier: cat.tier || 2,
            });
          }
        }
      }
    }

    return { accessed };
  }

  /**
   * Produce the final HoneyFileVerdict combining hash comparison + Tracee access detection.
   */
  generateVerdict(hashResult = {}, traceeResult = { accessed: [] }) {
    const accessedList = traceeResult.accessed || [];
    const filesAccessed = accessedList.map(a => a.path);
    const filesModified = hashResult.modified || [];
    const filesDeleted = hashResult.deleted || [];

    // Union of all triggered files
    const allTriggered = new Set([...filesAccessed, ...filesModified, ...filesDeleted]);
    const triggered = allTriggered.size > 0;

    // Determine highest severity from triggered files
    let highestSeverity = 'SAFE';
    const severityOrder = { SAFE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

    for (const fp of allTriggered) {
      const cat = HONEY_FILE_CATEGORIES[fp];
      if (cat && severityOrder[cat.severity] > severityOrder[highestSeverity]) {
        highestSeverity = cat.severity;
      }
    }

    // Build human-readable summary
    const summaryParts = [];
    if (filesAccessed.length > 0) {
      summaryParts.push(`Script READ ${filesAccessed.length} honey file(s): ${filesAccessed.join(', ')}`);
    }
    if (filesModified.length > 0) {
      summaryParts.push(`Script MODIFIED ${filesModified.length} honey file(s): ${filesModified.join(', ')}`);
    }
    if (filesDeleted.length > 0) {
      summaryParts.push(`Script DELETED ${filesDeleted.length} honey file(s): ${filesDeleted.join(', ')}`);
    }

    // Build per-file detail log with MITRE ATT&CK mappings
    const details = accessedList.map(a => ({
      path: a.path,
      action: filesModified.includes(a.path) ? 'modified' : (filesDeleted.includes(a.path) ? 'deleted' : 'read'),
      category: a.category,
      severity: a.severity,
      mitre_attack: a.mitre,
      tier: a.tier,
      detected_by_process: a.process_name,
      tracee_event: a.event_name,
    }));

    // Add modification-only entries (detected by hash but not by Tracee)
    for (const mp of filesModified) {
      if (!details.some(d => d.path === mp)) {
        const cat = HONEY_FILE_CATEGORIES[mp] || {};
        details.push({
          path: mp,
          action: filesDeleted.includes(mp) ? 'deleted' : 'modified',
          category: cat.category || 'unknown',
          severity: cat.severity || 'HIGH',
          mitre_attack: cat.mitre || null,
          tier: cat.tier || 2,
          detected_by_process: 'hash_verification',
          tracee_event: null,
        });
      }
    }

    return {
      triggered,
      total_honey_files: HONEY_FILE_PATHS.length,
      files_accessed: filesAccessed.length,
      files_modified: filesModified.length,
      files_deleted: filesDeleted.length,
      highest_severity: highestSeverity,
      summary: summaryParts.length > 0
        ? summaryParts.join('. ') + '.'
        : 'No honey file interaction detected.',
      details,
    };
  }
}

module.exports = HoneyFileService;
module.exports.HONEY_FILE_PATHS = HONEY_FILE_PATHS;
module.exports.HONEY_FILE_CATEGORIES = HONEY_FILE_CATEGORIES;
module.exports.normalizeContainerPath = HoneyFileService.normalizeContainerPath;
