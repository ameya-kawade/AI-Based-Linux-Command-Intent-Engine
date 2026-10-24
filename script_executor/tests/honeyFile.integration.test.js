const HoneyFileService = require('../src/services/honeyFileService');

describe('HoneyFile Integration Scenarios', () => {
  let honeyService;

  beforeEach(() => {
    honeyService = new HoneyFileService();
  });

  it('HF-I01: should pass clean scripts without triggering honey trap', () => {
    const rawHashes = '';
    const hashResult = honeyService.compareHashes(rawHashes);
    const traceeResult = honeyService.scanTraceeForHoneyAccess([
      {
        event_name: 'execve',
        process: { name: 'ls' },
        details: { args: { pathname: '/bin/ls' } },
      },
      {
        event_name: 'openat',
        process: { name: 'ls' },
        details: { args: { pathname: '/tmp' } },
      },
    ]);

    const verdict = honeyService.generateVerdict(hashResult, traceeResult);
    expect(verdict.triggered).toBe(false);
    expect(verdict.highest_severity).toBe('SAFE');
    expect(verdict.files_accessed).toBe(0);
    expect(verdict.files_modified).toBe(0);
  });

  it('HF-I02: should detect credential harvester reading multiple honey files', () => {
    const mockTraceeAlerts = [
      {
        event_name: 'openat',
        process: { name: 'cat' },
        details: { args: { pathname: '/etc/shadow' } },
      },
      {
        event_name: 'openat',
        process: { name: 'cat' },
        details: { args: { pathname: '/root/.ssh/id_rsa' } },
      },
      {
        event_name: 'openat',
        process: { name: 'cat' },
        details: { args: { pathname: '/root/.aws/credentials' } },
      },
    ];

    const hashResult = honeyService.compareHashes('');
    const traceeResult = honeyService.scanTraceeForHoneyAccess(mockTraceeAlerts);
    const verdict = honeyService.generateVerdict(hashResult, traceeResult);

    expect(verdict.triggered).toBe(true);
    expect(verdict.highest_severity).toBe('CRITICAL');
    expect(verdict.files_accessed).toBe(3);
    expect(verdict.summary).toContain('/etc/shadow');
    expect(verdict.summary).toContain('/root/.ssh/id_rsa');
    expect(verdict.summary).toContain('/root/.aws/credentials');
  });

  it('HF-I05: should detect honey file modification via hash mismatch', () => {
    const manifest = honeyService.loadManifest();
    expect(manifest).toBeDefined();

    const envPath = '/root/.env';
    const fakeTamperedOutput = `tampered_hash_1234567890abcdef ${envPath}`;

    const hashResult = honeyService.compareHashes(fakeTamperedOutput);
    expect(hashResult.modified).toContain(envPath);

    const verdict = honeyService.generateVerdict(hashResult, { accessed: [] });
    expect(verdict.triggered).toBe(true);
    expect(verdict.files_modified).toBe(1);
    expect(verdict.details[0].action).toBe('modified');
    expect(verdict.details[0].path).toBe(envPath);
    expect(verdict.details[0].category).toBe('api_secret_theft');
  });

  it('HF-I06: should detect honey file deletion', () => {
    const awsCredsPath = '/root/.aws/credentials';
    const fakeDeletedOutput = `DELETED ${awsCredsPath}`;

    const hashResult = honeyService.compareHashes(fakeDeletedOutput);
    expect(hashResult.deleted).toContain(awsCredsPath);

    const verdict = honeyService.generateVerdict(hashResult, { accessed: [] });
    expect(verdict.triggered).toBe(true);
    expect(verdict.files_deleted).toBe(1);
    expect(verdict.highest_severity).toBe('CRITICAL');
    expect(verdict.details[0].action).toBe('deleted');
    expect(verdict.details[0].path).toBe(awsCredsPath);
  });
});
