const SandboxService = require('../services/sandboxService');
const DockerService = require('../services/dockerService');
const logger = require('../utils/logger');

class SandboxController {
  /**
   * POST /api/analyze
   * Executes bash script inside dynamic sandbox and returns Tracee eBPF security telemetry
   */
  static async analyze(req, res, next) {
    try {
      const { script, options } = req.body;
      logger.info('Received script analysis request', {
        scriptLength: script.length,
      });

      const result = await SandboxService.executeAndAnalyze(script, options);
      
      const httpStatus = result.status === 'success' ? 200 : (result.metadata?.timedOut ? 200 : 200);
      return res.status(httpStatus).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/health
   * Health check for API server and Docker daemon status
   */
  static async health(req, res, next) {
    try {
      const dockerHealth = await DockerService.checkDockerHealth();

      const status = dockerHealth.available ? 'healthy' : 'degraded';
      const statusCode = dockerHealth.available ? 200 : 503;

      return res.status(statusCode).json({
        status,
        timestamp: new Date().toISOString(),
        docker: dockerHealth,
        system: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = SandboxController;
