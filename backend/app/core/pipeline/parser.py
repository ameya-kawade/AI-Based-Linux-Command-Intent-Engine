import re
import shlex
from typing import Dict, List, Optional, Tuple
from app.core.models import PipelineOperatorInfo, PipelineStage, CommandExplanation


# Known shell operators and their semantic explanations
OPERATOR_METADATA: Dict[str, Tuple[str, str]] = {
    "|": (
        "Pipeline (Stdout)",
        "Streams standard output (stdout) of the preceding command directly into the standard input (stdin) of the following command."
    ),
    "|&": (
        "Pipeline (Stdout & Stderr)",
        "Streams both standard output (stdout) and standard error (stderr) of the preceding command into the stdin of the following command."
    ),
    "&&": (
        "Logical AND",
        "Executes the following command only if the preceding command succeeds with an exit status code of 0."
    ),
    "||": (
        "Logical OR",
        "Executes the following command only if the preceding command fails with a non-zero exit status code."
    ),
    ";": (
        "Sequential Execution",
        "Executes the following command unconditionally after the preceding command completes."
    ),
    "&": (
        "Background Execution",
        "Launches the preceding command asynchronously in a background subshell without waiting for completion."
    ),
}

# Wrapper commands that execute a secondary target binary/command
WRAPPER_COMMANDS = {
    "sudo", "xargs", "nohup", "time", "doas", "nice", "ionice",
    "strace", "ltrace", "authbind", "chroot", "parallel", "timeout"
}

# Options for wrappers that take an argument
WRAPPER_OPTS_WITH_ARG: Dict[str, set] = {
    "sudo": {"-u", "-g", "-p", "-h", "-C", "-c", "-T", "--user", "--group", "--prompt", "--host"},
    "xargs": {"-a", "-d", "-E", "-e", "-I", "-i", "-L", "-l", "-n", "-P", "-s", "--arg-file", "--delimiter", "--eof", "--replace", "--max-lines", "--max-args", "--max-procs", "--max-chars"},
    "timeout": {"-s", "-k", "--signal", "--kill-after"},
    "nice": {"-n", "--adjustment"},
    "ionice": {"-c", "-n", "-p", "--class", "--classdata", "--pid"},
    "chroot": {"--userspec", "--groups"},
    "parallel": {"-j", "-n", "-k", "-P", "--jobs", "--max-args", "--colsep"},
}


class PipelineCommandParser:
    """
    Parses complex compound shell pipelines and chained commands into structured
    command stages and operator connectors, respecting quotes, escapes, subshells,
    and wrapper commands (e.g. xargs, sudo, nohup, find -exec).
    """

    @classmethod
    def get_operator_info(cls, op: str) -> PipelineOperatorInfo:
        """Returns structured metadata and explanation for a shell operator."""
        name, desc = OPERATOR_METADATA.get(op, ("Shell Operator", f"Shell control operator '{op}'"))
        return PipelineOperatorInfo(operator=op, name=name, description=desc)

    @classmethod
    def split_pipeline_stages(cls, cmd_line: str) -> List[Tuple[str, Optional[str]]]:
        """
        Splits a compound shell command line into a sequence of (subcommand_str, trailing_operator).
        Handles quotes ('...', \"...\"), escaped characters, subshells, and multi-char operators.
        
        Example:
          'find / -name "*.tmp" | xargs rm -rf'
          -> [('find / -name "*.tmp"', '|'), ('xargs rm -rf', None)]
        """
        clean_cmd = cmd_line.strip()
        if not clean_cmd:
            return []

        stages: List[Tuple[str, Optional[str]]] = []
        chars = list(clean_cmd)
        n = len(chars)

        i = 0
        cur_stage: List[str] = []
        in_single_quote = False
        in_double_quote = False
        in_backtick = False
        paren_depth = 0
        brace_depth = 0

        while i < n:
            c = chars[i]

            # Handle escaping with backslash
            if c == "\\" and not in_single_quote and i + 1 < n:
                cur_stage.append(c)
                cur_stage.append(chars[i + 1])
                i += 2
                continue

            # Handle single quotes
            if c == "'" and not in_double_quote:
                in_single_quote = not in_single_quote
                cur_stage.append(c)
                i += 1
                continue

            # Handle double quotes
            if c == '"' and not in_single_quote:
                in_double_quote = not in_double_quote
                cur_stage.append(c)
                i += 1
                continue

            # Handle backticks
            if c == '`' and not in_single_quote:
                in_backtick = not in_backtick
                cur_stage.append(c)
                i += 1
                continue

            # Track parentheses and braces outside quotes
            if not in_single_quote and not in_double_quote and not in_backtick:
                if c == "(":
                    paren_depth += 1
                elif c == ")" and paren_depth > 0:
                    paren_depth -= 1
                elif c == "{" and (i == 0 or chars[i-1].isspace()):
                    brace_depth += 1
                elif c == "}" and brace_depth > 0:
                    brace_depth -= 1

                # If at top level (depth 0), check for pipeline & control operators
                if paren_depth == 0 and brace_depth == 0:
                    # Check 2-character operators first: |&, &&, ||
                    two_char = clean_cmd[i:i+2]
                    if two_char in ("|&", "&&", "||"):
                        stage_str = "".join(cur_stage).strip()
                        if stage_str:
                            stages.append((stage_str, two_char))
                        cur_stage = []
                        i += 2
                        continue

                    # Check 1-character operators: |, ;, &
                    # Ensure single & is not part of >& or 2>&1
                    if c in ("|", ";", "&"):
                        # If preceded by > or < (e.g. 2>&1, >&), treat as redirection token, not pipeline operator
                        is_redir = False
                        if c == "&" and cur_stage and cur_stage[-1] in (">", "<", "1", "2"):
                            is_redir = True

                        if not is_redir:
                            stage_str = "".join(cur_stage).strip()
                            if stage_str:
                                stages.append((stage_str, c))
                            cur_stage = []
                            i += 1
                            continue

            cur_stage.append(c)
            i += 1

        # Add any trailing stage
        final_str = "".join(cur_stage).strip()
        if final_str:
            stages.append((final_str, None))

        return stages

    @classmethod
    def decompose_wrapper_command(cls, stage_cmd: str) -> Tuple[str, List[str], Optional[str]]:
        """
        Detects if a command stage starts with a wrapper (e.g. xargs, sudo, nohup, timeout),
        separating the wrapper invocation tokens from the nested target command string.
        
        Returns:
          (wrapper_name, wrapper_tokens, nested_command_line_str or None)
        """
        clean = stage_cmd.strip()
        if not clean:
            return "", [], None

        try:
            tokens = shlex.split(clean)
        except Exception:
            tokens = clean.split()

        if not tokens:
            return "", [], None

        first_tok = os_basename = tokens[0].split("/")[-1].lower()

        # Handle 'env' wrapper with environment assignments (e.g. env VAR=1 foo -x)
        if first_tok == "env":
            idx = 1
            wrapper_tokens = [tokens[0]]
            while idx < len(tokens):
                t = tokens[idx]
                if t.startswith("-") or "=" in t:
                    wrapper_tokens.append(t)
                    idx += 1
                else:
                    break
            if idx < len(tokens):
                nested_cmd = " ".join(tokens[idx:])
                return "env", wrapper_tokens, nested_cmd
            return "env", wrapper_tokens, None

        # Handle standard wrappers (xargs, sudo, nohup, timeout, etc.)
        if first_tok in WRAPPER_COMMANDS:
            opts_with_arg = WRAPPER_OPTS_WITH_ARG.get(first_tok, set())
            idx = 1
            wrapper_tokens = [tokens[0]]

            while idx < len(tokens):
                t = tokens[idx]
                # If t is a flag
                if t.startswith("-"):
                    wrapper_tokens.append(t)
                    # Check if flag takes a separate argument (e.g. -u ameya, -I {})
                    if t in opts_with_arg and idx + 1 < len(tokens) and not tokens[idx + 1].startswith("-"):
                        idx += 1
                        wrapper_tokens.append(tokens[idx])
                    idx += 1
                elif first_tok == "timeout" and (t.isdigit() or re.match(r"^\d+[smhd]?$", t)):
                    # Timeout duration argument
                    wrapper_tokens.append(t)
                    idx += 1
                elif first_tok == "nice" and (t.startswith("-") or t.isdigit()):
                    wrapper_tokens.append(t)
                    idx += 1
                else:
                    # Encountered the nested command
                    break

            if idx < len(tokens):
                nested_cmd = " ".join(tokens[idx:])
                return first_tok, wrapper_tokens, nested_cmd
            return first_tok, wrapper_tokens, None

        return first_tok, tokens, None
