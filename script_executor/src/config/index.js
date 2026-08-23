require('dotenv').config();
const path = require('path');
const os = require('os');

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || 'development',
  
  // Docker sandbox settings
  sandbox: {
    defaultImage: process.env.SANDBOX_IMAGE || 'alpine:latest',
    shellBinary: process.env.SANDBOX_SHELL || '/bin/sh',
    timeoutMs: parseInt(process.env.EXECUTION_TIMEOUT_MS, 10) || 10000,
    memoryLimit: process.env.CONTAINER_MEMORY_LIMIT || '256m',
    cpusLimit: process.env.CONTAINER_CPUS_LIMIT || '1.0',
    pidsLimit: parseInt(process.env.CONTAINER_PIDS_LIMIT, 10) || 100,
    tempDirBase: process.env.TEMP_DIR_BASE || path.join(os.tmpdir(), 'sandbox_runs'),
  },

  // Tracee eBPF settings
  tracee: {
    image: process.env.TRACEE_IMAGE || 'aquasec/tracee:latest',
    initWaitMs: parseInt(process.env.TRACEE_INIT_WAIT_MS, 10) || 2500,
    dockerSocket: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
    cacheDir: process.env.TRACEE_CACHE_DIR || '/tmp/tracee',
    events: process.env.TRACEE_EVENTS || 'default,execve,execveat,openat,open,security_file_open,ptrace,connect,socket,bind,memfd_create,init_module,finit_module,bpf',
  },

  dockerBinary: process.env.DOCKER_BINARY || 'docker',
  maxScriptSizeBytes: parseInt(process.env.MAX_SCRIPT_SIZE_BYTES, 10) || 1024 * 1024, // 1MB
};

module.exports = config;
