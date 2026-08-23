import asyncio
import os
from pathlib import Path
import shlex
import signal
import time
from typing import Callable, Optional, Tuple


class CommandExecutor:
    def __init__(self, initial_cwd: Optional[Path] = None):
        self.current_cwd: Path = initial_cwd or Path.cwd().resolve()
        self.previous_cwd: Path = self.current_cwd
        self.active_process: Optional[asyncio.subprocess.Process] = None
        self._cancelled: bool = False

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
        """Built-in cd command handler. Returns (is_cd, output_message, exit_code)."""
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

    async def execute(
        self,
        command: str,
        on_output_chunk: Optional[Callable[[str], None]] = None,
    ) -> Tuple[str, int, int, str]:
        """
        Executes a shell command asynchronously with real-time output streaming.
        Returns (full_output, exit_code, duration_ms, status)
        where status is 'success', 'error', or 'cancelled'.
        """
        self._cancelled = False
        start_time = time.perf_counter()

        # Handle built-in cd directly
        is_cd, cd_output, cd_code = self.handle_cd(command)
        if is_cd:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            status = "success" if cd_code == 0 else "error"
            if cd_output and on_output_chunk:
                on_output_chunk(cd_output)
            return (cd_output, cd_code, duration_ms, status)

        full_output = []

        try:
            # Run in distinct process group for immediate, reliable signal propagation
            self.active_process = await asyncio.create_subprocess_shell(
                command,
                cwd=str(self.current_cwd),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=os.environ.copy(),
                preexec_fn=os.setsid,
            )

            # Stream output in real time
            while True:
                line = await self.active_process.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace")
                full_output.append(decoded)
                if on_output_chunk:
                    on_output_chunk(decoded)

            await self.active_process.wait()
            exit_code = self.active_process.returncode or 0
            self.active_process = None

            duration_ms = int((time.perf_counter() - start_time) * 1000)
            status = "cancelled" if self._cancelled else ("success" if exit_code == 0 else "error")
            return ("".join(full_output), exit_code, duration_ms, status)

        except asyncio.CancelledError:
            self.abort_active_process()
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            return ("".join(full_output) + "\n[Cancelled by user]\n", 130, duration_ms, "cancelled")
        except Exception as e:
            err_msg = f"Error executing command: {str(e)}\n"
            if on_output_chunk:
                on_output_chunk(err_msg)
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            return (err_msg, 1, duration_ms, "error")
        finally:
            self.active_process = None

    def abort_active_process(self) -> None:
        """Instantly sends SIGINT & SIGKILL to the entire child process group."""
        self._cancelled = True
        if self.active_process and self.active_process.returncode is None:
            try:
                pgid = os.getpgid(self.active_process.pid)
                os.killpg(pgid, signal.SIGINT)
                # Ensure child threads/daemons also terminate immediately
                try:
                    os.killpg(pgid, signal.SIGKILL)
                except Exception:
                    pass
            except ProcessLookupError:
                pass
            except Exception:
                try:
                    self.active_process.kill()
                except Exception:
                    pass
