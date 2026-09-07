import os
from pathlib import Path
import shlex
from typing import Callable, Optional, Tuple


class CommandExecutor:
    """
    Manages working directory context and paths.
    Arbitrary host shell execution has been permanently disabled for security.
    All untrusted command execution must run inside the isolated Docker sandbox.
    """

    def __init__(self, initial_cwd: Optional[Path] = None):
        self.current_cwd: Path = initial_cwd or Path.cwd().resolve()
        self.previous_cwd: Path = self.current_cwd

    def get_prompt_path(self) -> str:
        """Returns shortened path for prompt (replacing home with ~)"""
        try:
            home = str(Path.home())
            cwd_str = str(self.current_cwd)
            if cwd_str == home:
                return "~"
            if cwd_str.startswith(home + "/"):
                return "~" + cwd_str[len(home):]
            return cwd_str
        except Exception:
            return str(self.current_cwd)

    def handle_cd(self, command: str) -> Tuple[bool, str, int]:
        """Built-in cd command handler for virtual directory navigation."""
        tokens = []
        try:
            tokens = shlex.split(command)
        except Exception:
            tokens = command.split()

        if not tokens or tokens[0] != "cd":
            return (False, "", 0)

        target = tokens[1] if len(tokens) > 1 else "~"

        if target == "-":
            target_path = self.previous_cwd
        elif target.startswith("~"):
            target_path = Path(os.path.expanduser(target)).resolve()
        else:
            target_path = (self.current_cwd / target).resolve()

        if not target_path.exists():
            return (True, f"cd: no such file or directory: {target}\n", 1)
        if not target_path.is_dir():
            return (True, f"cd: not a directory: {target}\n", 1)

        self.previous_cwd = self.current_cwd
        self.current_cwd = target_path
        return (True, "", 0)

    async def run_on_host(
        self,
        command: str,
        cwd: Optional[str] = None,
        on_output_chunk: Optional[Callable[[str], None]] = None,
    ) -> Tuple[str, int, int, str]:
        """Permanently disabled host execution endpoint."""
        raise PermissionError(
            "Host shell execution is permanently disabled for security. "
            "Commands must be analyzed or executed within the isolated Docker sandbox."
        )

    async def execute(
        self,
        command: str,
        on_output_chunk: Optional[Callable[[str], None]] = None,
    ) -> Tuple[str, int, int, str]:
        """
        Refuses host command execution. Host execution has been deprecated and disabled.
        """
        raise PermissionError(
            "Host shell execution is permanently disabled for security. "
            "Commands must be analyzed or executed within the isolated Docker sandbox."
        )

    def abort_active_process(self) -> None:
        """No-op on host since host execution is disabled."""
        pass
