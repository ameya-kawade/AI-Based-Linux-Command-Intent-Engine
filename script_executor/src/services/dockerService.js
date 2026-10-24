const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize Dockerode instance connected to the Docker socket
const docker = new Docker({
  socketPath: config.tracee.dockerSocket || '/var/run/docker.sock',
});

/**
 * Parse memory strings like '256m', '1g', '512k' into bytes
 */
function parseMemoryToBytes(memStr) {
  if (typeof memStr === 'number') return memStr;
  const match = String(memStr).toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmg])?b?$/);
  if (!match) return 256 * 1024 * 1024; // default 256MB
  const val = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'k') return Math.floor(val * 1024);
  if (unit === 'm') return Math.floor(val * 1024 * 1024);
  if (unit === 'g') return Math.floor(val * 1024 * 1024 * 1024);
  return Math.floor(val);
}

/**
 * Parse CPU string like '1.0', '0.5' into NanoCPUs (1 CPU = 1e9 NanoCPUs)
 */
function parseCpusToNanoCPUs(cpuStr) {
  const val = parseFloat(cpuStr);
  return isNaN(val) ? 1e9 : Math.floor(val * 1e9);
}

class DockerService {
  /**
   * Get underlying Dockerode instance
   */
  static getDocker() {
    return docker;
  }

  /**
   * Check if Docker daemon is responsive and return server version
   */
  static async checkDockerHealth() {
    try {
      await docker.ping();
      const versionInfo = await docker.version();
      return {
        available: true,
        version: versionInfo.Version || 'unknown',
        apiVersion: versionInfo.ApiVersion || 'unknown',
      };
    } catch (err) {
      return {
        available: false,
        error: err.message,
      };
    }
  }

  /**
   * Check if a docker image exists in local image cache
   */
  static async isImageAvailable(imageName) {
    try {
      const image = docker.getImage(imageName);
      await image.inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pull image if not already available locally
   */
  static async ensureImage(imageName) {
    const available = await this.isImageAvailable(imageName);
    if (!available) {
      logger.info(`Pulling Docker image ${imageName} via Dockerode...`);
      await new Promise((resolve, reject) => {
        docker.pull(imageName, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (followErr, res) => {
            if (followErr) return reject(followErr);
            resolve(res);
          });
        });
      });
      logger.info(`Successfully pulled image ${imageName}`);
    }
  }

  /**
   * Create unprivileged sandbox container in created state
   */
  static async createSandboxContainer({ containerName, hostScriptPath, image, shellBinary, honeyFileEnabled }) {
    const targetImage = honeyFileEnabled ? config.honeyFile.image : (image || config.sandbox.defaultImage);
    const isReadonly = honeyFileEnabled ? false : config.sandbox.readonlyRootfs;
    const targetShell = shellBinary || config.sandbox.shellBinary;

    // Verify image availability before container creation
    const isAvailable = await this.isImageAvailable(targetImage);
    if (!isAvailable) {
      if (honeyFileEnabled && targetImage === config.honeyFile.image) {
        logger.error(`Honey file image '${targetImage}' is not available locally. It must be built first.`);
        throw new Error(`Honey file image '${targetImage}' not found locally. Please build it first using build-honeypot.sh.`);
      } else {
        logger.info(`Sandbox image '${targetImage}' not found locally. Pulling...`);
        await this.ensureImage(targetImage);
      }
    }

    const memoryBytes = parseMemoryToBytes(config.sandbox.memoryLimit);
    const nanoCpus = parseCpusToNanoCPUs(config.sandbox.cpusLimit);

    logger.debug(`Creating sandbox container ${containerName} via Dockerode`, {
      image: targetImage,
      memoryBytes,
      nanoCpus,
    });

    const container = await docker.createContainer({
      name: containerName,
      Image: targetImage,
      Cmd: [targetShell, '/sandbox/script.sh'],
      WorkingDir: '/sandbox',
      User: config.sandbox.user || '10001:10001',
      HostConfig: {
        Memory: memoryBytes,
        NanoCPUs: nanoCpus,
        PidsLimit: config.sandbox.pidsLimit,
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'],
        ReadonlyRootfs: isReadonly,
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=64m',
          '/run': 'rw,noexec,nosuid,size=16m',
        },
        NetworkMode: config.sandbox.networkMode || 'none',
        Binds: [`${hostScriptPath}:/sandbox/script.sh:ro`],
      },
    });

    return {
      containerId: container.id,
      containerName,
      container,
    };
  }

  /**
   * Start Tracee container with required eBPF capabilities and host mounts
   */
  static async startTraceeContainer({ traceeContainerName, hostMountDir }) {
    const btfPath = '/sys/kernel/btf/vmlinux';
    const btfMount = fs.existsSync(btfPath) ? ['/sys/kernel/btf:/sys/kernel/btf:ro'] : [];
    // Resolve real path for os-release — on Arch Linux /etc/os-release is a symlink
    // to /usr/lib/os-release. Docker bind-mount DOES NOT follow symlinks so Tracee
    // crashes on startup if we naively mount /etc/os-release directly.
    let osReleaseMount = [];
    const osReleaseCandidates = ['/etc/os-release', '/usr/lib/os-release', '/usr/lib64/os-release'];
    for (const candidate of osReleaseCandidates) {
      if (fs.existsSync(candidate)) {
        try {
          const realPath = fs.realpathSync(candidate);
          if (fs.existsSync(realPath) && fs.statSync(realPath).isFile()) {
            osReleaseMount = [`${realPath}:/etc/os-release-host:ro`];
            logger.debug(`Mounting real os-release path: ${realPath} -> /etc/os-release-host`);
            break;
          }
        } catch { /* skip broken symlinks */ }
      }
    }
    const cgroupMount = fs.existsSync('/sys/fs/cgroup') ? ['/sys/fs/cgroup:/sys/fs/cgroup:ro'] : [];

    const binds = [
      ...cgroupMount,
      ...osReleaseMount,
      ...btfMount,
      '/lib/modules:/lib/modules:ro',
      '/usr/src:/usr/src:ro',
      `${hostMountDir}:/tmp/tracee`,
      `${config.tracee.dockerSocket}:/var/run/docker.sock:ro`,
    ];

    logger.info(`Starting Tracee eBPF container ${traceeContainerName} via Dockerode`, {
      events: config.tracee.events,
    });

    const traceeContainer = await docker.createContainer({
      name: traceeContainerName,
      Image: config.tracee.image,
      Cmd: [
        '--events', config.tracee.events,
        '--scope', 'container=new',
        '--output', 'json:/tmp/tracee/tracee.ndjson',
        '--output', 'option:parse-arguments',
      ],
      HostConfig: {
        Privileged: true,
        PidMode: 'host',
        CgroupnsMode: 'host',
        Binds: binds,
      },
    });

    await traceeContainer.start();
    return traceeContainer;
  }

  /**
   * Run sandbox container and collect demuxed stdout/stderr with strict timeout
   */
  static async runSandboxContainer({ containerName, timeoutMs }) {
    const effectiveTimeout = timeoutMs || config.sandbox.timeoutMs;
    const container = docker.getContainer(containerName);

    logger.info(`Attaching and starting sandbox container ${containerName} (timeout: ${effectiveTimeout}ms)`);

    // Attach to stdout and stderr streams before start
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    let stdout = '';
    let stderr = '';
    const stdoutPass = new PassThrough();
    const stderrPass = new PassThrough();

    stdoutPass.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    stderrPass.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    // Demux multiplexed Docker stream into stdout and stderr
    container.modem.demuxStream(stream, stdoutPass, stderrPass);

    let isTimedOut = false;
    let timeoutTimer = null;

    const killOnTimeout = new Promise((resolve) => {
      timeoutTimer = setTimeout(async () => {
        isTimedOut = true;
        logger.warn(`Sandbox execution timeout exceeded (${effectiveTimeout}ms) for ${containerName}. Killing container via Dockerode.`);
        try {
          await container.kill();
        } catch (killErr) {
          logger.error(`Error killing timed out container ${containerName}: ${killErr.message}`);
        }
        resolve({ timedOut: true });
      }, effectiveTimeout);
    });

    try {
      await container.start();

      const waitPromise = container.wait().then((res) => ({
        timedOut: false,
        exitCode: res.StatusCode,
      }));

      const outcome = await Promise.race([waitPromise, killOnTimeout]);

      if (timeoutTimer) clearTimeout(timeoutTimer);

      return {
        exitCode: isTimedOut ? 137 : (outcome.exitCode ?? 0),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut: isTimedOut,
      };
    } catch (err) {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      return {
        exitCode: isTimedOut ? 137 : -1,
        stdout: stdout.trim(),
        stderr: `${stderr}\nExecution error: ${err.message}`.trim(),
        timedOut: isTimedOut,
      };
    }
  }

  /**
   * Stop Tracee container gracefully with SIGINT signal to flush all buffers
   */
  static async stopTraceeGracefully(containerName) {
    if (!containerName) return;
    try {
      logger.debug(`Gracefully stopping Tracee container: ${containerName} with SIGINT`);
      const container = docker.getContainer(containerName);
      await container.stop({ t: 3, signal: 'SIGINT' });
    } catch (err) {
      logger.warn(`Tracee stop via Dockerode returned: ${err.message}`);
    }
  }

  /**
   * Stop and force remove a container safely
   */
  static async stopAndRemoveContainer(containerName) {
    if (!containerName) return;
    try {
      logger.debug(`Cleaning up container via Dockerode: ${containerName}`);
      const container = docker.getContainer(containerName);
      await container.remove({ force: true, v: true });
    } catch (err) {
      // Container might already have been removed or never started
      logger.debug(`Container remove note for ${containerName}: ${err.message}`);
    }
  }


  /**
   * Execute sha256sum on all honey files inside a STOPPED container
   * by committing it to a temp image and running a one-shot hash dump.
   */
  static async dumpHoneyFileHashes(containerName, honeyPaths) {
    const container = docker.getContainer(containerName);
    const tempImageName = `honeyhash-${Date.now()}`;
    
    try {
      await container.commit({ repo: tempImageName, tag: 'latest' });
    } catch (commitErr) {
      logger.warn(`Failed to commit stopped container for honey hash dump: ${commitErr.message}`);
      return '';
    }

    try {
      const hashCmd = honeyPaths.map(p => `sha256sum '${p}' 2>/dev/null || echo "DELETED ${p}"`).join('; ');

      const hashContainer = await docker.createContainer({
        Image: `${tempImageName}:latest`,
        Cmd: ['sh', '-c', hashCmd],
        User: 'root',
      });

      // Attach stream BEFORE starting the container to prevent race conditions with fast-exiting commands
      const stream = await hashContainer.attach({ stream: true, stdout: true, stderr: true });

      let output = '';
      const { PassThrough } = require('stream');
      const stdoutPass = new PassThrough();
      const stderrPass = new PassThrough();

      stdoutPass.on('data', (chunk) => { output += chunk.toString('utf8'); });
      hashContainer.modem.demuxStream(stream, stdoutPass, stderrPass);

      const streamDone = new Promise((resolve) => {
        let count = 0;
        const checkDone = () => {
          count++;
          if (count >= 2) resolve();
        };
        stdoutPass.on('end', checkDone);
        stderrPass.on('end', checkDone);
        setTimeout(resolve, 3000);
      });

      await hashContainer.start();
      await hashContainer.wait();
      await streamDone;

      await hashContainer.remove({ force: true });

      return output.trim();
    } finally {
      try {
        const tempImage = docker.getImage(`${tempImageName}:latest`);
        await tempImage.remove({ force: true });
      } catch { /* ignore */ }
    }
  }

}

module.exports = DockerService;
