const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const DockerService = require('./dockerService');
const TraceeParser = require('./traceeParser');
const logger = require('../utils/logger');

class SandboxService {
  /**
   * Execute bash script inside isolated Docker container and monitor with Tracee eBPF
   * @param {string} script - The raw bash script
   * @param {Object} options - Custom execution options
   * @returns {Promise<Object>} Execution result with script output and tracee alerts
   */
  static async executeAndAnalyze(script, options = {}) {
    const execId = uuidv4();
    const targetContainerName = `sandbox-target-${execId}`;
    const traceeContainerName = `sandbox-tracee-${execId}`;
    const runDir = path.join(config.sandbox.tempDirBase, execId);
    const scriptPath = path.join(runDir, 'script.sh');
    const traceeLogPath = path.join(runDir, 'tracee.ndjson');

    const startTime = Date.now();

    try {
      // 1. Ensure base temp directory exists with open permissions (0777)
      if (!fs.existsSync(config.sandbox.tempDirBase)) {
        fs.mkdirSync(config.sandbox.tempDirBase, { recursive: true });
      }
      try {
        fs.chmodSync(config.sandbox.tempDirBase, 0o777);
      } catch {
        // Ignore chmod error if already owned
      }

      // 2. Ensure per-request temp directory exists with 0777
      if (!fs.existsSync(runDir)) {
        fs.mkdirSync(runDir, { recursive: true });
      }
      fs.chmodSync(runDir, 0o777);

      // 3. Write raw bash script to temporary directory
      fs.writeFileSync(scriptPath, script, { encoding: 'utf8', mode: 0o755 });
      logger.info(`[${execId}] Prepared sandbox workspace at ${runDir}`);

      // 4. Create unprivileged target sandbox container via Dockerode
      const { containerId } = await DockerService.createSandboxContainer({
        containerName: targetContainerName,
        hostScriptPath: scriptPath,
        image: options.image || config.sandbox.defaultImage,
        shellBinary: options.shellBinary || config.sandbox.shellBinary,
      });
      logger.info(`[${execId}] Target container created via Dockerode: ${targetContainerName} (${containerId})`);

      // 5. Start Tracee eBPF container via Dockerode
      await DockerService.startTraceeContainer({
        traceeContainerName,
        targetContainerName,
        targetContainerId: containerId,
        hostMountDir: runDir,
      });

      // 6. Allow brief initialization time for Tracee eBPF kernel probes to attach
      const initWaitMs = options.traceeInitWaitMs || config.tracee.initWaitMs;
      logger.debug(`[${execId}] Waiting ${initWaitMs}ms for Tracee eBPF probe initialization...`);
      await new Promise((resolve) => setTimeout(resolve, initWaitMs));

      // 7. Run target container with strict 10s timeout via Dockerode
      const executionTimeoutMs = options.timeoutMs || config.sandbox.timeoutMs;
      const { exitCode, stdout, stderr, timedOut } = await DockerService.runSandboxContainer({
        containerName: targetContainerName,
        timeoutMs: executionTimeoutMs,
      });

      // 8. Small flush delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 9. Gracefully stop Tracee with SIGINT to flush all buffered events to file
      await DockerService.stopTraceeGracefully(traceeContainerName);

      const durationMs = Date.now() - startTime;
      logger.info(`[${execId}] Sandbox run completed in ${durationMs}ms (exitCode: ${exitCode}, timedOut: ${timedOut})`);

      // 10. Parse Tracee eBPF security alerts & behavioral events
      const parsedAlerts = await TraceeParser.parseLogFile(traceeLogPath);
      const summary = TraceeParser.generateSummary(parsedAlerts);

      // Combine stdout and stderr for the script_output
      let combinedOutput = stdout;
      if (stderr) {
        combinedOutput = combinedOutput ? `${combinedOutput}\n${stderr}` : stderr;
      }

      // Determine overall status
      const isError = timedOut || exitCode !== 0;
      const status = isError ? 'error' : 'success';

      let errorMessage = null;
      if (timedOut) {
        errorMessage = `Execution timed out: exceeded maximum allowed time of ${executionTimeoutMs / 1000}s.`;
      } else if (exitCode !== 0) {
        errorMessage = `Script execution failed with exit code ${exitCode}.`;
      }

      return {
        status,
        ...(errorMessage && { error: errorMessage }),
        script_output: combinedOutput || (timedOut ? '[Process killed due to execution timeout]' : ''),
        tracee_alerts: parsedAlerts,
        metadata: {
          execution_id: execId,
          exit_code: exitCode,
          timed_out: timedOut,
          duration_ms: durationMs,
          summary,
        },
      };
    } catch (err) {
      logger.error(`[${execId}] Sandbox execution pipeline failed: ${err.message}`, { stack: err.stack });
      return {
        status: 'error',
        error: `Sandbox execution pipeline error: ${err.message}`,
        script_output: '',
        tracee_alerts: [],
        metadata: {
          execution_id: execId,
          exit_code: -1,
          timed_out: false,
          duration_ms: Date.now() - startTime,
          summary: {
            total_events: 0,
            security_alerts_count: 0,
            severity_breakdown: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 },
            categories: {},
            detected_signatures: [],
          },
        },
      };
    } finally {
      // 11. Strict Cleanup via Dockerode: Stop and remove containers and temp directories
      logger.debug(`[${execId}] Performing cleanup of containers and temporary files via Dockerode`);
      await Promise.allSettled([
        DockerService.stopAndRemoveContainer(targetContainerName),
        DockerService.stopAndRemoveContainer(traceeContainerName),
      ]);

      // Remove temp directory unless debug retention is explicitly enabled
      if (process.env.KEEP_TEMP_FILES !== 'true') {
        try {
          if (fs.existsSync(runDir)) {
            fs.rmSync(runDir, { recursive: true, force: true });
            logger.debug(`[${execId}] Removed temporary directory ${runDir}`);
          }
        } catch (cleanupErr) {
          logger.warn(`[${execId}] Failed to clean up temp directory ${runDir}: ${cleanupErr.message}`);
        }
      }
    }
  }
}

module.exports = SandboxService;
