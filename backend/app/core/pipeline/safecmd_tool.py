import logging
import os
import shutil
from typing import List, Tuple

# Ensure PATH includes common binary directories where shfmt or safecmd are installed
home = os.path.expanduser("~")
for extra_path in [
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
    SafeCmd Allowlist & AST Policy Tool.
    Leverages AnswerDotAI's safecmd with shfmt AST parser to extract nested commands,
    pipes, redirections, and validate against strict security allowlists.
    """

    @property
    def name(self) -> str:
        return "SafeCmd AST Allowlist Engine"

    @property
    def description(self) -> str:
        return "AST-based command extraction and allowlist sandbox policy validation"

    async def process(self, context: PipelineContext) -> None:
        cmd = context.command.strip()
        if not cmd:
            context.safecmd_verdict = SafeCmdVerdict(
                allowed=True,
                message="Empty command line",
                extracted_commands=[],
                redirects=[],
            )
            context.tools_executed.append(self.name)
            return

        extracted_cmds: List[List[str]] = []
        redirects: List[Tuple[str, str]] = []

        # 1. AST Extraction
        try:
            commands, ops, redirs = extract_commands(cmd)
            extracted_cmds = [list(c) for c in commands]
            redirects = [(str(r[0]), str(r[1])) for r in redirs]
        except Exception as e:
            logger.debug(f"AST extraction fallback for '{cmd}': {e}")

        # 2. Allowlist Validation
        try:
            safecmd.validate(cmd)
            verdict = SafeCmdVerdict(
                allowed=True,
                message="Command and redirection destinations conform to strict allowlist policy.",
                extracted_commands=extracted_cmds,
                redirects=redirects,
            )
        except DisallowedCmd as e:
            disallowed_cmd_str = " ".join(e.cmd) if hasattr(e, "cmd") and e.cmd else str(e)
            verdict = SafeCmdVerdict(
                allowed=False,
                disallowed_target=disallowed_cmd_str,
                disallowed_type="command",
                message=f"Disallowed command or destructive option: '{disallowed_cmd_str}'",
                extracted_commands=extracted_cmds,
                redirects=redirects,
            )
            context.warnings.append(
                f"SafeCmd Policy: Command or subcommand '{disallowed_cmd_str}' is blocked by sandbox allowlist."
            )
        except DisallowedDest as e:
            dest_str = str(e.args[0]) if e.args else str(e)
            verdict = SafeCmdVerdict(
                allowed=False,
                disallowed_target=dest_str,
                disallowed_type="destination",
                message=f"Disallowed redirection/destination path: '{dest_str}'",
                extracted_commands=extracted_cmds,
                redirects=redirects,
            )
            context.warnings.append(
                f"SafeCmd Policy: Output path '{dest_str}' is outside permitted sandboxes (allowed: /tmp or current directory)."
            )
        except DisallowedError as e:
            verdict = SafeCmdVerdict(
                allowed=False,
                disallowed_target=str(e),
                disallowed_type="command",
                message=f"Blocked by SafeCmd policy: {str(e)}",
                extracted_commands=extracted_cmds,
                redirects=redirects,
            )
            context.warnings.append(f"SafeCmd Policy: {str(e)}")
        except Exception as e:
            # Syntax or parsing error in shfmt
            verdict = SafeCmdVerdict(
                allowed=False,
                disallowed_target=None,
                disallowed_type="syntax",
                message=f"AST Syntax/Parser Error: {str(e)}",
                extracted_commands=extracted_cmds,
                redirects=redirects,
            )

        context.safecmd_verdict = verdict
        context.tools_executed.append(self.name)
