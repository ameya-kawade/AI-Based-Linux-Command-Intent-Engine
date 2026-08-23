# Tracee eBPF Dynamic Sandbox API

A high-performance, secure Node.js and Express.js dynamic sandbox service built with the **Docker SDK (`dockerode`)**. It accepts arbitrary bash scripts via a REST API, executes them within resource-constrained unprivileged Docker containers, and performs real-time kernel-level behavioral monitoring and threat detection using [Aqua Security Tracee](https://github.com/aquasec/tracee) eBPF probes.

---

## Architecture Overview

```
                                  +-----------------------------------------------+
                                  |             Express API Server                |
                                  +-----------------------------------------------+
                                            |                             |
                                            v (Dockerode SDK)             v (Dockerode SDK)
                             +-------------------------------+  +-----------------------------+
                             |    Target Sandbox Container   |  |   Tracee Monitor Container  |
                             |       (Unprivileged)          |  |       (--privileged)        |
                             +-------------------------------+  +-----------------------------+
                             | * Non-root / Cap-drop         |  | * eBPF Probes & Signatures  |
                             | * Memory / CPU / PID limits   |  | * /sys/kernel/btf           |
                             | * no-new-privileges           |  | * /var/run/docker.sock      |
                             | * Read-only script mount      |  | * NDJSON telemetry stream   |
                             +-------------------------------+  +-----------------------------+
                                            \                             /
                                             \                           /
                                        +-------------------------------------+
                                        |          Linux Host Kernel          |
                                        +-------------------------------------+
```

### Security & Isolation Design

1. **Native Docker SDK (`dockerode`):**
   - Direct programmatic container lifecycle control over `/var/run/docker.sock`.
   - Real-time multiplexed stdout/stderr stream demuxing via `container.modem.demuxStream`.
2. **Unprivileged Target Sandboxing:**
   - The user script runs inside an unprivileged container (`alpine:latest` by default).
   - `--security-opt=no-new-privileges:true` prevents privilege escalation attacks.
   - Resource limits (`Memory: 256MB`, `NanoCPUs: 1.0 CPU`, `PidsLimit: 100`) protect against DoS and fork-bombs.
   - The script is mounted as read-only (`:ro`).
3. **Tracee eBPF Monitoring:**
   - Only the Tracee monitor container runs in `Privileged: true` mode to attach eBPF probes to kernel syscall tracepoints and kprobes.
   - Captures behavioral signatures, sensitive file access (`/etc/shadow`, `/etc/passwd`), suspicious syscalls (`ptrace`, `memfd_create`), and network activity.
4. **Strict Timeout Enforcement:**
   - Strict 10-second execution timeout. If a script runs indefinitely (e.g. `while true; do sleep 1; done`), the target container is forcefully killed (`container.kill()`) and a timeout status is returned.
5. **Concurrency & Zero Collision:**
   - Every request is assigned a UUIDv4 identifier. Container names (`sandbox-target-<uuid>`, `sandbox-tracee-<uuid>`) and workspaces (`/tmp/sandbox_runs/<uuid>`) are completely isolated.
6. **Guaranteed Cleanup:**
   - Both target and monitor containers (`container.remove({ force: true })`), along with temporary directories, are cleaned up in guaranteed `finally` blocks and process termination handlers (`SIGINT`, `SIGTERM`).

---

## Host Prerequisites

To run the sandbox server and Tracee eBPF monitoring, ensure your host satisfies:

1. **Operating System:** Linux with kernel version **>= 4.18** (Kernel **5.4+** or **5.8+** with BTF support recommended).
   - Verify BTF support: `ls -l /sys/kernel/btf/vmlinux`
2. **Docker Engine:** Docker daemon installed and running (`docker version`).
3. **Permissions:** The user running the Node.js service must have permissions to interact with `/var/run/docker.sock` (e.g. member of the `docker` group or run as root).
4. **Required Images:**
   - `aquasec/tracee:latest`
   - `alpine:latest` (or your configured target sandbox image)

---

## Installation & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
You can configure behavior via `.env` or system environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port for the Express server |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`) |
| `SANDBOX_IMAGE` | `alpine:latest` | Base container image for script execution |
| `SANDBOX_SHELL` | `/bin/sh` | Shell interpreter inside the sandbox |
| `EXECUTION_TIMEOUT_MS` | `10000` | Execution timeout in milliseconds (default 10s) |
| `TRACEE_IMAGE` | `aquasec/tracee:latest` | Tracee Docker image |
| `TRACEE_INIT_WAIT_MS` | `2500` | Wait time (ms) for Tracee eBPF probes to attach |
| `CONTAINER_MEMORY_LIMIT`| `256m` | Memory limit per sandbox container |
| `CONTAINER_CPUS_LIMIT` | `1.0` | CPU limit per sandbox container |
| `CONTAINER_PIDS_LIMIT` | `100` | Maximum PIDs per sandbox container (fork bomb protection) |
| `TEMP_DIR_BASE` | `/tmp/sandbox_runs` | Host directory for temporary scripts & logs |

### 3. Start the Server
```bash
npm start
```

For development with hot-reloading:
```bash
npm run dev
```

---

## API Documentation

### 1. Health Check
* **Endpoint:** `GET /api/health`
* **Description:** Returns server and Docker daemon health status.

#### Example Response (`200 OK`):
```json
{
  "status": "healthy",
  "timestamp": "2026-08-21T16:47:19.000Z",
  "docker": {
    "available": true,
    "version": "29.7.2",
    "apiVersion": "1.52"
  },
  "system": {
    "uptime": 12.34,
    "memoryUsage": { ... },
    "nodeVersion": "v22.21.1"
  }
}
```

---

### 2. Analyze Script
* **Endpoint:** `POST /api/analyze`
* **Content-Type:** `application/json`
* **Payload:**
  ```json
  {
    "script": "echo 'Hello Sandbox'; cat /etc/passwd; uname -a"
  }
  ```

#### Example Request with `curl`:
```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "script": "echo \"Scanning system...\"; cat /etc/passwd; whoami"
  }'
```

#### Example Success Response (`200 OK`):
```json
{
  "status": "success",
  "script_output": "Scanning system...\nroot:x:0:0:root:/root:/bin/sh\n...\nroot",
  "tracee_alerts": [
    {
      "timestamp": "2026-08-21T16:43:50.032Z",
      "event_id": "257",
      "event_name": "openat",
      "category": "file_access",
      "severity": "INFO",
      "is_security_alert": false,
      "description": "Accessed file: /etc/passwd",
      "process": {
        "name": "cat",
        "pid": 1234,
        "ppid": 1200,
        "user_id": 0
      },
      "container": {
        "id": "a505b68b5434",
        "name": "sandbox-target-...",
        "image": "alpine:latest"
      },
      "details": {
        "return_value": 3,
        "args": {
          "pathname": "/etc/passwd",
          "flags": 0
        },
        "matched_policies": [""],
        "mitre_attack": null
      }
    }
  ],
  "metadata": {
    "execution_id": "8f05da3d-8036-4d45-8f98-413e58ba8031",
    "exit_code": 0,
    "timed_out": false,
    "duration_ms": 14989,
    "summary": {
      "total_events": 25,
      "security_alerts_count": 1,
      "severity_breakdown": {
        "CRITICAL": 0,
        "HIGH": 1,
        "MEDIUM": 0,
        "LOW": 0,
        "INFO": 24
      },
      "categories": {
        "file_access": 20,
        "process_execution": 5
      },
      "detected_signatures": []
    }
  }
}
```

#### Example Timeout Response (`200 OK` / `status: "error"`):
```json
{
  "status": "error",
  "error": "Execution timed out: exceeded maximum allowed time of 10s.",
  "script_output": "Entering infinite loop...",
  "tracee_alerts": [ ... ],
  "metadata": {
    "execution_id": "47b3a4a8-d4cf-4488-a1d4-28af093192d4",
    "exit_code": 137,
    "timed_out": true,
    "duration_ms": 26878,
    "summary": { ... }
  }
}
```

---

## Running Tests

Run the automated test suite with Jest:
```bash
npm test
```

Run live integration verification against real Docker/Tracee instance via Dockerode:
```bash
node tests/live_api_verification.js
```
