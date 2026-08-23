const app = require('./app');
const config = require('./config');
const DockerService = require('./services/dockerService');
const logger = require('./utils/logger');

const server = app.listen(config.port, async () => {
  logger.info(`===================================================`);
  logger.info(`Tracee Dynamic Sandbox Server running on port ${config.port}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`Sandbox Image: ${config.sandbox.defaultImage}`);
  logger.info(`Tracee Image: ${config.tracee.image}`);
  logger.info(`Execution Timeout: ${config.sandbox.timeoutMs}ms`);
  logger.info(`===================================================`);

  // Verify Docker Daemon connectivity on startup
  const dockerHealth = await DockerService.checkDockerHealth();
  if (dockerHealth.available) {
    logger.info(`Docker Daemon Connected (Server Version: ${dockerHealth.version})`);
  } else {
    logger.warn(`Docker Daemon Warning: ${dockerHealth.error}. Sandbox execution may fail until Docker is started.`);
  }
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force shutdown if connections do not close in time
  setTimeout(() => {
    logger.error('Forcing process exit after shutdown timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise });
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

module.exports = server;
