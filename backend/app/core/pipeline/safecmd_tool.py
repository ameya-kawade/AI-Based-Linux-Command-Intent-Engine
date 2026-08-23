import logging
import os
import re
import shutil
from typing import List, Tuple, Dict, Any, Optional

# Ensure PATH includes virtual environment binary directory (where shfmt and safecmd reside)
home = os.path.expanduser("~")
script_dir = os.path.dirname(os.path.abspath(__file__))
app_root = os.path.abspath(os.path.join(script_dir, "..", "..", ".."))
venv_bin = os.path.join(app_root, ".venv", "bin")

for extra_path in [
    venv_bin,
    os.path.join(home, "go", "bin"),
    os.path.join(home, ".local", "bin"),
    "/usr/local/bin",
    "/usr/bin",
]:
    if os.path.exists(extra_path) and extra_path not in os.environ.get("PATH", ""):
        os.environ["PATH"] = f"{extra_path}:{os.environ.get('PATH', '')}"

import safecmd
from safecmd.bashxtract import extract_commands
from safecmd.core import DisallowedCmd, DisallowedDest, DisallowedError

from app.core.models import SafeCmdVerdict
from app.core.pipeline.base import BasePipelineTool, PipelineContext

logger = logging.getLogger(__name__)


class SafeCmdTool(BasePipelineTool):
    """
    Enhanced SafeCmd Allowlist & AST Policy Tool powered by shfmt parser.
    Extracts Abstract Syntax Tree (AST) nodes (commands, arguments, operators, redirections,
    and subshells) and applies multi-layer security policies against:
      1. Pipeline remote code ingestion (curl | bash, wget | sh)
      2. Destructive root/system path operations (rm -rf /, find -delete)
      3. Raw disk block device overwriting (dd of=/dev/sd*, mkfs)
      4. System file redirection tampering (/etc/passwd, ~/.ssh/authorized_keys)
      5. Unauthorized network socket listener spawning (nc -lvnp, /dev/tcp/)
      6. Subcommand escape flags in otherwise benign tools (find -exec, awk system)
      7. SUID/SGID tampering & privilege escalation (chmod +s, chmod 777 /)
      8. Environment variable preloading & hijacking (LD_PRELOAD, LD_LIBRARY_PATH)
      9. Fork bombs and obfuscated pipeline execution (base64 -d | sh)
    """

    # Protected root and system file paths
    CRITICAL_SYSTEM_PATHS = {
        "/", "/*", "/root", "/etc", "/etc/passwd", "/etc/shadow", "/etc/sudoers",
        "/etc/crontab", "/var", "/var/log", "/usr", "/usr/bin", "/usr/sbin",
        "/boot", "/dev", "/sys", "/proc", "~", "$HOME", "/home"
    }

    INTERPRETER_BINARIES = {
        "bash", "sh", "zsh", "dash", "ksh", "csh", "tcsh",
        "python", "python2", "python3", "perl", "ruby", "node", "php", "lua"
    }

    DOWNLOADER_BINARIES = {"curl", "wget", "fetch", "http", "aria2c", "lynx"}

    NETWORK_LISTENER_BINARIES = {"nc", "netcat", "ncat", "socat"}

    RAW_DISK_DEVICES = ("/dev/sd", "/dev/nvme", "/dev/vd", "/dev/hd", "/dev/loop", "/dev/mapper")

    @property
    def name(self) -> str:
        return "SafeCmd AST Allowlist Engine"

    @property
    def description(self) -> str:
        return "AST-based command extraction and allowlist sandbox policy validation powered by shfmt"

    async def process(self, context: PipelineContext) -> None:
        cmd = context.command.strip()
        if not cmd:
            context.safecmd_verdict = SafeCmdVerdict(
                allowed=True,
                message="Empty command line",
                extracted_commands=[],
                redirects=[],
                rule_violations=[],
                ast_operators=[],
                policy_level="STRICT_AST",
            )
            context.tools_executed.append(self.name)
            return

        extracted_cmds: List[List[str]] = []
        ops_set: List[str] = []
        redirects: List[Tuple[str, str]] = []
        rule_violations: List[str] = []

        # 1. shfmt AST Extraction
        try:
            commands, ops, redirs = extract_commands(cmd)
            extracted_cmds = [list(c) for c in commands]
            ops_set = sorted(list(ops)) if ops else []
            redirects = [(str(r[0]), str(r[1])) for r in redirs]
        except Exception as e:
            logger.debug(f"shfmt AST extraction fallback for '{cmd}': {e}")
            # Fallback simple split if shfmt encountered rare syntax
            parts = [p.strip().split() for p in re.split(r"[;&|]+", cmd) if p.strip()]
            extracted_cmds = parts

        # 2. Deep AST Security Rule Checks
        self._inspect_ast_rules(cmd, extracted_cmds, ops_set, redirects, rule_violations)

        # 3. Base SafeCmd Allowlist Validation
        safecmd_allowed = True
        disallowed_target: Optional[str] = None
        disallowed_type: Optional[str] = None
        message = "Command conforms to strict AST sandbox policy."

        try:
            safecmd.validate(cmd)
        except DisallowedCmd as e:
            safecmd_allowed = False
            disallowed_cmd_str = " ".join(e.cmd) if hasattr(e, "cmd") and e.cmd else str(e)
            disallowed_target = disallowed_cmd_str
            disallowed_type = "command"
            message = f"Disallowed command or destructive option: '{disallowed_cmd_str}'"
        except DisallowedDest as e:
            safecmd_allowed = False
            dest_str = str(e.args[0]) if e.args else str(e)
            disallowed_target = dest_str
            disallowed_type = "destination"
            message = f"Disallowed redirection destination path: '{dest_str}'"
        except DisallowedError as e:
            safecmd_allowed = False
            disallowed_target = str(e)
            disallowed_type = "policy_error"
            message = f"Blocked by SafeCmd policy: {str(e)}"
        except Exception as e:
            # shfmt or syntax issue
            safecmd_allowed = False
            disallowed_type = "syntax"
            message = f"AST Syntax/Parser Error: {str(e)}"

        # 4. Integrate AST Rule Violations into Final Verdict
        if rule_violations:
            safecmd_allowed = False
            if not disallowed_type or disallowed_type == "syntax":
                disallowed_type = "ast_rule_violation"
            message = f"SafeCmd AST Policy Violation: {rule_violations[0]}"
            for violation in rule_violations:
                context.warnings.append(f"SafeCmd AST Policy: {violation}")
        elif not safecmd_allowed and message:
            context.warnings.append(f"SafeCmd AST Policy: {message}")

        context.safecmd_verdict = SafeCmdVerdict(
            allowed=safecmd_allowed,
            disallowed_target=disallowed_target,
            disallowed_type=disallowed_type,
            message=message,
            extracted_commands=extracted_cmds,
            redirects=redirects,
            rule_violations=rule_violations,
            ast_operators=ops_set,
            policy_level="STRICT_AST",
        )
        context.tools_executed.append(self.name)

    def _inspect_ast_rules(
        self,
        raw_cmd: str,
        extracted_cmds: List[List[str]],
        ops: List[str],
        redirects: List[Tuple[str, str]],
        violations: List[str]
    ) -> None:
        """Applies comprehensive compiler-level AST security rules on shfmt nodes."""

        # Rule 1: Pipeline Remote Code Ingestion (e.g. curl ... | bash, wget ... | sh)
        if "|" in ops:
            has_downloader = False
            downloader_cmd = ""
            for idx, cmd_tokens in enumerate(extracted_cmds):
                if not cmd_tokens:
                    continue
                bin_name = os.path.basename(cmd_tokens[0]).lower()
                if bin_name in self.DOWNLOADER_BINARIES:
                    has_downloader = True
                    downloader_cmd = bin_name
                elif has_downloader and bin_name in self.INTERPRETER_BINARIES:
                    violations.append(
                        f"Unsafe pipeline code ingestion: remote stream from '{downloader_cmd}' piped directly into interpreter '{bin_name}'."
                    )
                elif bin_name in ("base64", "openssl", "xxd") and any(f in cmd_tokens for f in ("-d", "--decode", "-r")):
                    # Encoded payload pipe
                    if idx + 1 < len(extracted_cmds):
                        next_bin = os.path.basename(extracted_cmds[idx + 1][0]).lower()
                        if next_bin in self.INTERPRETER_BINARIES:
                            violations.append(
                                f"Obfuscated execution: decoded stream from '{bin_name}' piped into interpreter '{next_bin}'."
                            )

        # Rule 2: Inspect Individual Subcommand AST Tokens
        for cmd_tokens in extracted_cmds:
            if not cmd_tokens:
                continue
            bin_name = os.path.basename(cmd_tokens[0]).lower()
            joined_args = " ".join(cmd_tokens[1:])

            # Check 2a: Destructive File Removal on Critical Paths
            if bin_name in ("rm", "unlink", "shred"):
                has_force_rec = any(
                    arg.startswith("-") and ("r" in arg.lower() or "f" in arg.lower())
                    for arg in cmd_tokens[1:]
                )
                for arg in cmd_tokens[1:]:
                    clean_arg = arg.rstrip("/").strip()
                    if clean_arg in self.CRITICAL_SYSTEM_PATHS or clean_arg in ("/", "/*", "*"):
                        violations.append(
                            f"Critical root/system path destruction: '{bin_name}' targeting '{arg}'."
                        )
                    elif clean_arg.startswith(("/etc", "/var", "/usr", "/boot", "/dev", "/sys", "/proc")):
                        violations.append(
                            f"High-risk system path deletion: '{bin_name}' targeting '{arg}'."
                        )

            # Check 2b: Raw Disk / Partition Writing
            elif bin_name == "dd":
                for arg in cmd_tokens[1:]:
                    if arg.startswith("of="):
                        target_of = arg[3:].strip()
                        if any(target_of.startswith(prefix) for prefix in self.RAW_DISK_DEVICES):
                            violations.append(
                                f"Direct raw block device write: 'dd' writing directly to '{target_of}'."
                            )
            elif bin_name in ("mkfs", "fdisk", "gdisk", "parted", "wipefs", "badblocks"):
                violations.append(
                    f"Direct filesystem formatting or partition table manipulation: '{bin_name}'."
                )

            # Check 2c: Subcommand Escapes & Injected Execution Flags in "Safe" Utilities
            elif bin_name == "find":
                if any(arg in ("-exec", "-execdir", "-ok", "-okdir", "-delete") for arg in cmd_tokens[1:]):
                    violations.append(
                        f"Uncontained execution escape: 'find' invoked with arbitrary execution flag."
                    )
            elif bin_name == "awk":
                if "system(" in joined_args or "getline" in joined_args:
                    violations.append(
                        f"Arbitrary system call escape inside awk script: '{joined_args}'."
                    )
            elif bin_name in ("vim", "vi", "nano", "ed", "gdb"):
                if any(arg.startswith("-c") or arg.startswith("-x") or arg.startswith("-s") for arg in cmd_tokens[1:]):
                    violations.append(
                        f"Editor/debugger command execution escape: '{bin_name} {joined_args}'."
                    )

            # Check 2d: Unauthorized Network Socket Listeners
            elif bin_name in self.NETWORK_LISTENER_BINARIES:
                if any(
                    arg.startswith("-") and "l" in arg.lower()
                    or "LISTEN" in arg.upper()
                    for arg in cmd_tokens[1:]
                ):
                    violations.append(
                        f"Unauthorized network socket listener opened via '{bin_name}'."
                    )

            # Check 2e: SUID / Dangerous Permission Tampering
            elif bin_name == "chmod":
                if any(arg in ("+s", "u+s", "g+s", "4755", "4777", "777", "-R") for arg in cmd_tokens[1:]):
                    if any(p in joined_args for p in ("/", "/etc", "/bin", "/sbin", "/usr", "/root")):
                        violations.append(
                            f"Privilege escalation risk: dangerous permissions '{joined_args}' applied to system paths."
                        )

            # Check 2f: Environment Variable Hijacking
            for token in cmd_tokens:
                if any(token.startswith(f"{v}=") for v in ("LD_PRELOAD", "LD_LIBRARY_PATH", "NODE_OPTIONS", "BASH_ENV")):
                    violations.append(
                        f"Dynamic linker / environment variable hijack detected: '{token}'."
                    )

        # Rule 3: Redirection & Destination Target Analysis
        for redir_op, redir_target in redirects:
            clean_target = redir_target.strip()
            # Kernel SysRq / trigger write
            if clean_target.startswith("/proc/sysrq-trigger"):
                violations.append(
                    f"Kernel state disruption: redirection into '{clean_target}'."
                )
            # Sensitive configuration / credential file overwrite
            elif clean_target in (
                "/etc/passwd", "/etc/shadow", "/etc/sudoers", "/etc/crontab",
                "/etc/ld.so.preload", "/etc/hosts", "/etc/resolv.conf"
            ) or clean_target.startswith(("/etc/cron.", "/root/.ssh", "/etc/sudoers.d")):
                violations.append(
                    f"Sensitive system credential or configuration path overwrite: '{redir_op} {clean_target}'."
                )
            # Raw device redirection
            elif any(clean_target.startswith(dev) for dev in self.RAW_DISK_DEVICES):
                violations.append(
                    f"Direct raw block device write via redirection: '{redir_op} {clean_target}'."
                )

        # Rule 4: Obfuscated Bash Socket & Fork Bomb Patterns
        if "/dev/tcp/" in raw_cmd or "/dev/udp/" in raw_cmd:
            violations.append(
                "Interactive reverse shell: bash network socket descriptor '/dev/tcp/' or '/dev/udp/' detected."
            )

        if re.search(r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:", raw_cmd) or "bomb|bomb" in raw_cmd:
            violations.append(
                "Denial of Service: recursive shell fork bomb pattern detected."
            )
