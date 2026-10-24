const HoneyFileService = require('../src/services/honeyFileService');
const { HONEY_FILE_PATHS, HONEY_FILE_CATEGORIES } = HoneyFileService;

describe('HoneyFileService', () => {
  let honeyService;

  beforeEach(() => {
    honeyService = new HoneyFileService();
  });

  describe('Inventory & Categories', () => {
    it('HF-U16: should define all 35 honey file paths', () => {
      expect(HONEY_FILE_PATHS.length).toBe(35);
    });

    it('HF-U15: every honey file path should have category and severity mapping', () => {
      for (const p of HONEY_FILE_PATHS) {
        const cat = HONEY_FILE_CATEGORIES[p];
        expect(cat).toBeDefined();
        expect(cat.category).toBeDefined();
        expect(['CRITICAL', 'HIGH', 'MEDIUM']).toContain(cat.severity);
        expect(cat.tier).toBeGreaterThanOrEqual(1);
        expect(cat.tier).toBeLessThanOrEqual(3);
      }
    });

    it('HF-U17: all paths should be absolute within /etc or /root', () => {
      for (const p of HONEY_FILE_PATHS) {
        expect(p.startsWith('/etc/') || p.startsWith('/root/')).toBe(true);
      }
    });
  });

  describe('compareHashes', () => {
    it('HF-U03: should identify intact files when hashes match', () => {
      honeyService._manifest = {
        version: '2.0.0',
        files: {
          '/etc/shadow': 'hash1',
          '/root/.ssh/id_rsa': 'hash2',
        },
      };

      const rawOutput = 'hash1 /etc/shadow\nhash2 /root/.ssh/id_rsa';
      const result = honeyService.compareHashes(rawOutput);

      expect(result.modified).toEqual([]);
      expect(result.deleted).toEqual([]);
      expect(result.intact).toEqual(['/etc/shadow', '/root/.ssh/id_rsa']);
    });

    it('HF-U04: should detect modified file when hash differs', () => {
      honeyService._manifest = {
        version: '2.0.0',
        files: {
          '/etc/shadow': 'original_hash',
          '/root/.env': 'env_hash',
        },
      };

      const rawOutput = 'changed_hash /etc/shadow\nenv_hash /root/.env';
      const result = honeyService.compareHashes(rawOutput);

      expect(result.modified).toEqual(['/etc/shadow']);
      expect(result.intact).toEqual(['/root/.env']);
    });

    it('HF-U05: should detect deleted file', () => {
      honeyService._manifest = {
        version: '2.0.0',
        files: {
          '/root/.aws/credentials': 'aws_hash',
        },
      };

      const rawOutput = 'DELETED /root/.aws/credentials';
      const result = honeyService.compareHashes(rawOutput);

      expect(result.deleted).toEqual(['/root/.aws/credentials']);
      expect(result.modified).toEqual(['/root/.aws/credentials']);
    });
  });

  describe('scanTraceeForHoneyAccess', () => {
    it('HF-U07: should detect honey file access in Tracee alerts', () => {
      const mockAlerts = [
        {
          event_name: 'openat',
          process: { name: 'cat' },
          details: { args: { pathname: '/root/.ssh/id_rsa' } },
        },
        {
          event_name: 'openat',
          process: { name: 'ls' },
          details: { args: { pathname: '/usr/bin/ls' } },
        },
      ];

      const result = honeyService.scanTraceeForHoneyAccess(mockAlerts);
      expect(result.accessed.length).toBe(1);
      expect(result.accessed[0].path).toBe('/root/.ssh/id_rsa');
      expect(result.accessed[0].category).toBe('ssh_credential_theft');
      expect(result.accessed[0].severity).toBe('CRITICAL');
      expect(result.accessed[0].mitre).toBe('T1552.004');
    });

    it('HF-U08: should deduplicate multiple accesses to the same honey file', () => {
      const mockAlerts = [
        {
          event_name: 'openat',
          process: { name: 'cat' },
          details: { args: { pathname: '/etc/shadow' } },
        },
        {
          event_name: 'security_file_open',
          process: { name: 'cat' },
          details: { args: { pathname: '/etc/shadow' } },
        },
      ];

      const result = honeyService.scanTraceeForHoneyAccess(mockAlerts);
      expect(result.accessed.length).toBe(1);
      expect(result.accessed[0].path).toBe('/etc/shadow');
    });
    it('HF-U20: should normalize Docker overlay2 and procfs paths in Tracee alerts', () => {
      const mockAlerts = [
        {
          event_name: 'openat',
          process: { name: 'cat' },
          details: { args: { pathname: '/var/lib/docker/overlay2/abc1234567890abcdef/merged/root/.ssh/id_rsa' } },
        },
        {
          event_name: 'openat',
          process: { name: 'python' },
          details: { args: { pathname: '/proc/12345/root/root/.aws/credentials' } },
        },
      ];

      const result = honeyService.scanTraceeForHoneyAccess(mockAlerts);
      expect(result.accessed.length).toBe(2);
      expect(result.accessed[0].path).toBe('/root/.ssh/id_rsa');
      expect(result.accessed[0].severity).toBe('CRITICAL');
      expect(result.accessed[1].path).toBe('/root/.aws/credentials');
      expect(result.accessed[1].severity).toBe('CRITICAL');
    });
  });

  describe('generateVerdict', () => {
    it('HF-U10: should return clean verdict when no interaction occurred', () => {
      const verdict = honeyService.generateVerdict({ modified: [], deleted: [], intact: [] }, { accessed: [] });
      expect(verdict.triggered).toBe(false);
      expect(verdict.highest_severity).toBe('SAFE');
      expect(verdict.files_accessed).toBe(0);
      expect(verdict.files_modified).toBe(0);
      expect(verdict.files_deleted).toBe(0);
      expect(verdict.summary).toContain('No honey file interaction detected');
    });

    it('HF-U11 & HF-U13: should promote severity to CRITICAL for Tier 1 file read', () => {
      const traceeResult = {
        accessed: [
          {
            path: '/root/.aws/credentials',
            event_name: 'openat',
            process_name: 'cat',
            category: 'cloud_credential_theft',
            severity: 'CRITICAL',
            mitre: 'T1552.001',
            tier: 1,
          },
        ],
      };

      const verdict = honeyService.generateVerdict({ modified: [], deleted: [] }, traceeResult);
      expect(verdict.triggered).toBe(true);
      expect(verdict.highest_severity).toBe('CRITICAL');
      expect(verdict.files_accessed).toBe(1);
      expect(verdict.summary).toContain('Script READ 1 honey file(s)');
      expect(verdict.details[0].mitre_attack).toBe('T1552.001');
    });
  });
});
