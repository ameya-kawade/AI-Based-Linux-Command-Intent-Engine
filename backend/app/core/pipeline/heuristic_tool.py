import re
from typing import List
from app.core.models import FilesystemImpact, ImpactLevel, NetworkImpact
from app.core.pipeline.base import BasePipelineTool, PipelineContext


class HeuristicAnalyzerTool(BasePipelineTool):
    """
    Rule-based heuristic security, system impact, and safer alternative analyzer.
    Detects reverse shells, listening sockets, kernel triggers (sysrq),
    data wipers, permission escalation, and filesystem mutations, proposing
    concrete, actionable, and secure command alternatives.
    """

    @property
    def name(self) -> str:
        return "Rule-Based Heuristic Security Analyzer"

    @property
    def description(self) -> str:
        return "Pattern matching, threat heuristics, and safer alternative generation for shell commands"

    async def process(self, context: PipelineContext) -> None:
        cmd = context.command.strip()
        if not cmd:
            context.heuristic_risk = "SAFE"
            context.heuristic_intent = "Empty shell line (no-op)"
            context.heuristic_is_reversible = True
            return

        lower_cmd = cmd.lower()
        risk: ImpactLevel = "SAFE"
        is_reversible = True
        intent: str = ""
        rev_expl: str = ""
        warnings: List[str] = []
        alternatives: List[str] = []
        sys_state: List[str] = []

        fs_created: List[str] = []
        fs_modified: List[str] = []
        fs_deleted: List[str] = []
        net_endpoints: List[str] = []
        net_ports: List[int] = []
        net_downloads: List[str] = []

        # -------------------------------------------------------------
        # 1. Reverse & Bind Shells / Remote Code Execution Detection
        # -------------------------------------------------------------
        is_rev_shell = False
        if re.search(r"nc\s+.*-e\s+/bin/(ba)?sh", cmd) or re.search(r"ncat\s+.*-e\s+/bin/(ba)?sh", cmd) or re.search(r"netcat\s+.*-e\s+/bin/(ba)?sh", cmd):
            is_rev_shell = True
        elif "/dev/tcp/" in cmd or "/dev/udp/" in cmd:
            is_rev_shell = True
        elif re.search(r"bash\s+-i\s+>&", cmd) or "0>&1" in cmd and ("/bin/sh" in cmd or "/bin/bash" in cmd):
            is_rev_shell = True
        elif re.search(r"python[23]?\s+-c\s+['\"].*pty\.spawn.*['\"]", cmd) or "socket.socket" in cmd:
            is_rev_shell = True
        elif "socat" in cmd and "exec:" in lower_cmd:
            is_rev_shell = True

        if is_rev_shell:
            risk = "CRITICAL"
            is_reversible = False
            rev_expl = "Spawns an interactive remote shell process granting unauthenticated execution."
            intent = "Establish an unauthenticated outbound reverse interactive shell session"
            warnings.append("Command establishes a reverse interactive shell back to an external machine.")
            warnings.append("Grants external remote actors unconstrained shell access inside this host environment.")
            alternatives.append("ssh -R 2222:localhost:22 user@gateway.corp (Secure SSH Reverse Tunnel)")
            alternatives.append("cloudflared tunnel --url http://localhost:8080 (Encrypted Zero-Trust Tunnel)")
            alternatives.append("tailscale up (Secure Mesh VPN Connection)")

        # -------------------------------------------------------------
        # 2. Inbound Network Listener / Port Binding (Netcat / Socat)
        # -------------------------------------------------------------
        elif re.search(r"\b(nc|ncat|netcat)\s+.*-[a-zA-Z]*l", cmd):
            risk = "CAUTION"
            is_reversible = True
            rev_expl = "Listening socket remains open until process is killed."
            intent = "Open an unencrypted raw TCP/UDP listening port on the host"
            warnings.append("Opens an unauthenticated listening socket exposed to the network.")
            
            # Extract port if possible
            port_match = re.search(r"\b([1-9][0-9]{2,4})\b", cmd)
            p_str = port_match.group(1) if port_match else "8080"
            alternatives.append(f"ssh -L {p_str}:localhost:{p_str} user@remote (Encrypted SSH Tunnel)")
            alternatives.append(f"ncat --ssl -lvnp {p_str} (TLS Encrypted Listener)")

        # -------------------------------------------------------------
        # 3. Kernel Crashing / Panic Triggers & Direct Pseudo-Files
        # -------------------------------------------------------------
        elif "/proc/sysrq-trigger" in cmd:
            risk = "CRITICAL"
            is_reversible = False
            rev_expl = "Causes immediate kernel panic or hardware freeze; bypasses filesystem sync."
            intent = "Trigger an immediate kernel diagnostic crash or reset via Magic SysRq"
            warnings.append("Writing to /proc/sysrq-trigger forces immediate kernel reboot/panic without clean unmounting.")
            alternatives.append("sudo systemctl reboot (Graceful System Reboot)")
            alternatives.append("sudo systemctl poweroff (Graceful Shutdown)")
            sys_state.append("Linux Kernel Panic / State Reset")

        elif "/etc/shadow" in cmd and ("cat" in cmd or ">" in cmd or "cp" in cmd or "curl" in cmd or "nc" in cmd):
            risk = "CRITICAL"
            is_reversible = False
            rev_expl = "Exfiltrates or accesses sensitive hashed user passwords."
            intent = "Read or exfiltrate system password hashes from /etc/shadow"
            warnings.append("Accessing /etc/shadow exposes hashed credentials of all local users.")
            alternatives.append("id (Inspect current user and groups)")
            alternatives.append("getent passwd $USER (Safe user entry without password hashes)")
            alternatives.append("sudo chage -l $USER (View password aging metadata safely)")

        # -------------------------------------------------------------
        # 4. Blind Web Piped Script Execution (curl | bash, wget | sh)
        # -------------------------------------------------------------
        elif re.search(r"(curl|wget)\s+.*\|\s*(ba|z)?sh", cmd):
            risk = "CRITICAL"
            is_reversible = False
            rev_expl = "Executes unverified remote web script directly in shell without review."
            intent = "Download and immediately execute unverified remote shell script without inspection"
            warnings.append("Piping untrusted remote web scripts directly into a shell allows arbitrary remote code execution.")
            
            url_match = re.search(r"https?://[^\s\'\"\>\<\&|]+", cmd)
            url_str = url_match.group(0) if url_match else "https://example.com/install.sh"
            alternatives.append(f"curl -fsSL {url_str} -o install.sh && less install.sh && bash install.sh")
            alternatives.append(f"curl -fsSL {url_str} --output install.sh && bash -n install.sh")

        # -------------------------------------------------------------
        # 5. Destructive Filesystem Wipes & Raw Storage Overwrites
        # -------------------------------------------------------------
        elif "rm -rf /" in cmd or "rm -fr /" in cmd or re.search(r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+(/\*|/\s*$)", cmd):
            risk = "CRITICAL"
            is_reversible = False
            rev_expl = "Recursively unlinks root directory entries and system binaries."
            intent = "Recursively delete the entire operating system root directory (/)"
            warnings.append("Destroys all mounted partitions, installed operating system files, and system data.")
            alternatives.append("trash-put <target_folder> (Safe deletion to Trash folder)")
            alternatives.append("rm -ri <target_folder> (Interactive prompt before deleting each file)")
            fs_deleted.append("Operating System Root Filesystem (/)")

        elif re.search(r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+", cmd):
            risk = "CAUTION"
            is_reversible = False
            rev_expl = "Forcefully unlinks directory tree without interactive confirmation."
            intent = f"Forcefully delete files or directory tree without confirmation ({cmd})"
            warnings.append("Forceful recursive deletion permanently unlinks files without recovery.")
            target_match = re.search(r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f\s+([^\s;&|]+)", cmd)
            target = target_match.group(1) if target_match else "./target"
            alternatives.append(f"rm -ri {target} (Interactive confirmation before deleting)")
            alternatives.append(f"trash-put {target} (Move to Desktop Trash safely)")
            alternatives.append(f"find {target} -maxdepth 1 -name '*.tmp' -delete (Scoped deletion)")
            fs_deleted.append(f"Recursive path tree for {target}")

        elif re.search(r"mkfs\.[a-z0-9]+\s+/dev/sd[a-z]", cmd) or re.search(r"dd\s+.*of=/dev/(sd[a-z]|nvme[0-9]n[0-9])", cmd):
            risk = "CRITICAL"
            is_reversible = False
            rev_expl = "Direct byte overwrite of storage partition table and filesystem headers."
            intent = "Format or overwrite entire physical block storage device"
            warnings.append("Overwrites raw block storage device partition table and file data.")
            alternatives.append("lsblk -f (Safely inspect block devices and partition labels)")
            alternatives.append("fdisk -l /dev/sdX (View disk partition map without writing)")
            fs_deleted.append("Block storage device partition map & data")

        elif "> /dev/sda" in cmd or "> /dev/nvme" in cmd:
            risk = "CRITICAL"
            is_reversible = False
            rev_expl = "Raw write directly to block device."
            intent = "Direct byte overwrite of storage device"
            warnings.append("Direct stdout redirection to raw storage block device destroys data.")
            alternatives.append("lsblk -f (Verify block device labels first)")
            fs_deleted.append("Raw disk partition blocks")

        # -------------------------------------------------------------
        # 6. Dangerous Permission Escalation & Firewall Disabling
        # -------------------------------------------------------------
        elif re.search(r"chmod\s+(-R\s+)?(777|a\+rwx|u?go\+rwx)", cmd):
            risk = "CRITICAL"
            is_reversible = True
            rev_expl = "Security posture and permissions can be reverted with explicit restrictive policies."
            intent = "Grant unrestricted world-writable read/write/execute permissions (777)"
            warnings.append("Exposes filesystem paths to arbitrary unauthorized processes and world modifications.")
            target_match = re.search(r"chmod\s+(?:-R\s+)?(?:777|a\+rwx|u?go\+rwx)\s+([^\s;&|]+)", cmd)
            target = target_match.group(1) if target_match else "."
            alternatives.append(f"find {target} -type d -exec chmod 755 {{}} + && find {target} -type f -exec chmod 644 {{}} + (Standard Directory 755 & File 644)")
            alternatives.append(f"chmod 755 {target} (Restrict world-write permissions)")
            sys_state.append("System security policy / file permissions modified")

        elif "iptables -f" in lower_cmd or "ufw disable" in lower_cmd or "setenforce 0" in lower_cmd:
            risk = "CRITICAL"
            is_reversible = True
            rev_expl = "Firewall rules and SELinux enforcement can be re-enabled."
            intent = "Completely disable host firewall filtering or kernel SELinux enforcement"
            warnings.append("Disables network filtering, opening all incoming ports to unauthenticated network traffic.")
            alternatives.append("sudo ufw allow 80,443/tcp (Allow only specific required ports)")
            alternatives.append("sudo firewall-cmd --add-port=8080/tcp --permanent (Scoped firewall exception)")
            sys_state.append("Host firewall / kernel security policy disabled")

        # -------------------------------------------------------------
        # 7. Force Process Termination (kill -9 / pkill -9)
        # -------------------------------------------------------------
        elif re.search(r"\b(kill|pkill|killall)\s+(-9|-KILL)\b", cmd):
            risk = "CAUTION"
            is_reversible = False
            rev_expl = "SIGKILL forcibly halts process execution without allowing buffer flushes or state saves."
            intent = f"Forcibly terminate process immediately with SIGKILL ({cmd})"
            warnings.append("SIGKILL (-9) prevents applications from cleanly flushing buffers or saving database states.")
            pid_match = re.search(r"kill\s+-9\s+([0-9]+)", cmd)
            pid_str = pid_match.group(1) if pid_match else "<PID>"
            alternatives.append(f"kill -15 {pid_str} (Send graceful SIGTERM first to allow clean shutdown)")
            alternatives.append(f"systemctl stop <service_name> (Clean systemd daemon termination)")
            sys_state.append("Running process forcibly killed")

        # -------------------------------------------------------------
        # 8. Package Manager Installations / Removals
        # -------------------------------------------------------------
        elif re.search(r"\b(apt|apt-get|pacman|dnf|yum|zypper|brew)\s+(install|remove|purge|-S|-R|uninstall)\b", cmd) or re.search(r"\b(npm|pnpm|yarn|bun|pip|cargo)\s+(install|add|remove|uninstall)\b", cmd):
            risk = "CAUTION"
            is_reversible = True
            rev_expl = "Packages can be uninstalled or re-installed using package manager records."
            intent = "System package or module installation / removal"
            sys_state.append("Package database and installed binaries updated")

        # -------------------------------------------------------------
        # 9. General File Modifications, Archives, Copies, and Moves
        # -------------------------------------------------------------
        elif re.search(r"\b(rm|unlink)\b", cmd):
            risk = "CAUTION"
            is_reversible = False
            rev_expl = "Deleted files are unlinked from the filesystem and permanently removed."
            intent = f"Remove files or directories ({cmd})"
            fs_deleted.append("Target files/directories specified in arguments")
            warnings.append("Unlinked files cannot be recovered via standard filesystem operations.")
            target_match = re.search(r"rm\s+(?:-[a-zA-Z]+\s+)?([^\s;&|]+)", cmd)
            target = target_match.group(1) if target_match else "./target"
            alternatives.append(f"rm -i {target} (Prompt before deletion)")
            alternatives.append(f"trash-put {target} (Send to Desktop Trash safely)")

        elif re.search(r"\b(mv|rename)\b", cmd):
            risk = "CAUTION"
            is_reversible = True
            rev_expl = "File moves and renames can be undone by reversing source and destination paths."
            intent = f"Move or rename file paths ({cmd})"
            fs_modified.append("Source file relocated to destination")

        elif re.search(r"\b(cp|rsync|scp)\b", cmd):
            risk = "CAUTION"
            is_reversible = True
            rev_expl = "Filesystem writes and moves can generally be reversed by inverse operations."
            intent = f"Copy files to target location ({cmd})"
            fs_created.append("Copied destination files")

        elif re.search(r"\b(tar|zip|unzip|gzip|gunzip|bzip2|xz|7z)\b", cmd):
            risk = "CAUTION"
            is_reversible = True
            rev_expl = "Filesystem writes and moves can generally be reversed by inverse operations."
            intent = f"Archive or compress/decompress files ({cmd})"

        elif re.search(r"\b(touch|mkdir)\b", cmd):
            risk = "CAUTION"
            is_reversible = True
            rev_expl = "Created files or directories can be safely removed."
            intent = f"Create new filesystem files or directories ({cmd})"
            fs_created.append("New filesystem entries")

        # -------------------------------------------------------------
        # 10. Service & Process Management
        # -------------------------------------------------------------
        elif re.search(r"\b(systemctl|service)\s+(restart|stop|kill|disable|mask)\b", cmd):
            risk = "CAUTION"
            is_reversible = True
            rev_expl = "Services can be restarted or re-enabled with systemctl start/enable."
            intent = f"Alter system service state ({cmd})"
            sys_state.append("System service lifecycle altered")

        elif re.search(r"\b(kill|pkill|killall)\b", cmd):
            risk = "CAUTION"
            is_reversible = False
            rev_expl = "Terminated process state and in-memory execution cannot be restored."
            intent = f"Send termination signal to processes ({cmd})"
            sys_state.append("Running process terminated")

        # -------------------------------------------------------------
        # 11. Read-Only Inspection Commands
        # -------------------------------------------------------------
        elif cmd == "cd" or cmd.startswith("cd "):
            risk = "SAFE"
            is_reversible = True
            rev_expl = "Changes shell process working directory."
            intent = f"Change current working directory ({cmd})"

        elif re.search(r"\b(ls|ll|la|cat|bat|less|more|grep|rg|ag|find|pwd|whoami|id|date|uname|ps|top|htop|df|du|tree|which|whereis|file|head|tail|wc|stat|git\s+(status|log|diff|branch|show))\b", cmd) and not any(op in cmd for op in (">", ">>", "| sh", "| bash")):
            risk = "SAFE"
            is_reversible = True
            rev_expl = "Read-only inspection command; produces no side effects or mutations."
            intent = f"Inspect system state or read files without modification ({cmd})"

        # -------------------------------------------------------------
        # Network Endpoint & Port Extraction
        # -------------------------------------------------------------
        for match in re.finditer(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", cmd):
            ip = match.group(0)
            if not ip.startswith("127.") and ip != "0.0.0.0":
                net_endpoints.append(ip)

        for match in re.finditer(r"https?://[^\s\'\"\>\<\&]+", cmd):
            net_endpoints.append(match.group(0))

        for match in re.finditer(r"(?:-p\s*|--port\s*|\s+:?)([1-9][0-9]{2,4})\b", cmd):
            try:
                candidate_port = int(match.group(1))
                if 1 <= candidate_port <= 65535 and str(candidate_port) not in " ".join(net_endpoints):
                    net_ports.append(candidate_port)
            except ValueError:
                pass

        if net_endpoints:
            endpoints_str = ", ".join(net_endpoints)
            if not any(f"Targeting remote endpoint" in w for w in warnings):
                if net_ports:
                    warnings.append(f"Targeting remote endpoint {endpoints_str}:{net_ports[0]}.")
                else:
                    warnings.append(f"Targeting remote endpoint {endpoints_str}.")

        if "curl" in cmd or "wget" in cmd:
            if net_endpoints:
                net_downloads.append(net_endpoints[0])

        context.heuristic_risk = risk
        context.heuristic_intent = intent
        context.heuristic_is_reversible = is_reversible
        context.heuristic_rev_expl = rev_expl
        context.filesystem = FilesystemImpact(
            created=fs_created,
            modified=fs_modified,
            deleted=fs_deleted,
        )
        context.network = NetworkImpact(
            outbound_endpoints=net_endpoints,
            ports_opened=net_ports,
            downloads=net_downloads,
        )
        context.system_state_changes.extend(sys_state)
        context.warnings.extend(warnings)
        context.suggested_alternatives.extend(alternatives)
        context.tools_executed.append("Rule-Based Heuristic Security Analyzer")
