const request = require('supertest');
const app = require('../src/app');
const DockerService = require('../src/services/dockerService');
const SandboxService = require('../src/services/sandboxService');

describe('API Endpoints', () => {
  describe('GET /', () => {
    it('should return service info', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toBe(200);
      expect(res.body.service).toContain('Tracee');
      expect(res.body.endpoints).toBeDefined();
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      jest.spyOn(DockerService, 'checkDockerHealth').mockResolvedValueOnce({
        available: true,
        version: '26.0.0',
      });

      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.docker.available).toBe(true);
    });

    it('should return 503 if Docker is unavailable', async () => {
      jest.spyOn(DockerService, 'checkDockerHealth').mockResolvedValueOnce({
        available: false,
        error: 'Docker daemon not running',
      });

      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(503);
      expect(res.body.status).toBe('degraded');
    });
  });

  describe('POST /api/analyze validation', () => {
    it('should reject missing script', async () => {
      const res = await request(app).post('/api/analyze').send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe('error');
    });

    it('should mock successful execution', async () => {
      jest.spyOn(SandboxService, 'executeAndAnalyze').mockResolvedValueOnce({
        status: 'success',
        script_output: 'hello from sandbox',
        tracee_alerts: [
          {
            event_name: 'execve',
            category: 'process_execution',
            severity: 'INFO',
            is_security_alert: false,
          },
        ],
        metadata: {
          execution_id: 'mock-uuid',
          exit_code: 0,
          timed_out: false,
          duration_ms: 120,
        },
      });

      const res = await request(app)
        .post('/api/analyze')
        .send({ script: 'echo "hello from sandbox"' });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.script_output).toBe('hello from sandbox');
      expect(res.body.tracee_alerts.length).toBe(1);
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown route', async () => {
      const res = await request(app).get('/api/unknown-route');
      expect(res.statusCode).toBe(404);
      expect(res.body.status).toBe('error');
    });
  });
});
