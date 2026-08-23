import glob
import json
import logging
import os
import re
import shlex
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.models import CommandExplanation, FlagExplanation

logger = logging.getLogger(__name__)

# Thread-local storage for SQLite connections
_local = threading.local()


def _clean_markdown_summary(text: str) -> str:
    """Extracts a clean, single-line summary from manpage markdown text."""
    if not text:
        return ""
    lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
    if not lines:
        return ""
    
    first_line = lines[0]
    # If the first line is just the option declaration (e.g. **-v**, **--verbose**), grab the second line if available
    if (first_line.startswith("**") or first_line.startswith("-")) and len(lines) > 1:
        summary = lines[1]
    else:
        summary = first_line

    # Remove extra markdown artifacts
    summary = re.sub(r"[*_`\\]", "", summary)
    summary = summary.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return summary.strip()


def _get_canonical_declaration(text: str, short_list: List[str], long_list: List[str]) -> str:
    """Extracts the canonical header from option text or falls back to combined flags."""
    if text:
        first_line = text.strip().split("\n")[0].strip()
        if first_line.startswith("**") or first_line.startswith("-"):
            decl = re.sub(r"[*_`\\]", "", first_line)
            decl = decl.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
            if len(decl) < 80:
                return decl
    
    all_flags = list(dict.fromkeys(short_list + long_list))
    return ", ".join(all_flags) if all_flags else ""


def _takes_argument(opt_dict: Optional[Dict[str, Any]]) -> bool:
    """Returns True if the option accepts or requires an argument."""
    if not opt_dict:
        return False
    has_arg = opt_dict.get("has_argument")
    if has_arg is True:
        return True
    if isinstance(has_arg, list) and len(has_arg) > 0:
        return True
    return False


def _should_consume_next_token(opt_dict: Optional[Dict[str, Any]], next_token: str) -> bool:
    """Determines if the next token should be consumed as an argument value."""
    if not opt_dict or not next_token:
        return False
    has_arg = opt_dict.get("has_argument")
    if has_arg is True:
        return not next_token.startswith("-")
    if isinstance(has_arg, list):
        if next_token in has_arg:
            return True
        return not next_token.startswith("-")
    return False


class ExplainshellDB:
    """
    SQLite query and option indexing engine for explainshell manpage database.
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or self._find_database_path()
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def _find_database_path(self) -> Optional[str]:
        # 1. Environment variable
        env_path = os.environ.get("EXPLAINSHELL_DB_PATH")
        if env_path and os.path.exists(env_path):
            return os.path.abspath(env_path)

        # 2. Local module and data directories
        current_dir = Path(__file__).resolve().parent
        app_dir = current_dir.parent
        backend_dir = app_dir.parent
        web_dir = backend_dir.parent
        project_root = web_dir.parent

        search_dirs = [
            web_dir / "data",
            web_dir,
            backend_dir / "data",
            backend_dir,
            project_root / "data",
            project_root,
            Path.cwd() / "data",
            Path.cwd(),
        ]

        for s_dir in search_dirs:
            if s_dir.exists():
                matches = list(s_dir.glob("explainshell*.db"))
                if matches:
                    return str(matches[0].resolve())

        # 3. Workspace wide search
        if project_root.exists():
            root_matches = list(project_root.glob("**/explainshell*.db"))
            if root_matches:
                return str(root_matches[0].resolve())

        return None

    def is_available(self) -> bool:
        """Checks whether the database file exists and is accessible."""
        return bool(self.db_path and os.path.isfile(self.db_path))

    def _get_connection(self) -> Optional[sqlite3.Connection]:
        if not self.is_available():
            return None
        
        conn = getattr(_local, "explainshell_conn", None)
        if conn is None:
            try:
                uri = f"file:{os.path.abspath(self.db_path)}?mode=ro"
                conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
                _local.explainshell_conn = conn
            except Exception as e:
                logger.warning(f"Failed to open explainshell database at {self.db_path}: {e}")
                return None
        return conn

    def resolve_command_manpage(self, tokens: List[str]) -> Tuple[Optional[str], Optional[Dict[str, Any]], int]:
        """
        Resolves command tokens to manpage metadata.
        Supports multi-word subcommands (e.g. 'git commit', 'docker-run', 'ip route').
        Returns (matched_cmd_name, manpage_data_dict, consumed_token_count).
        """
        conn = self._get_connection()
        if not conn or not tokens:
            return None, None, 0

        cursor = conn.cursor()

        # Try up to 3 tokens (e.g. 'pg_autoctl create coordinator')
        max_lookahead = min(len(tokens), 3)
        for n in range(max_lookahead, 0, -1):
            candidate = " ".join(tokens[:n])
            hyphen_candidate = "-".join(tokens[:n])

            # Check in-memory cache first
            with self._lock:
                if candidate in self._cache:
                    return candidate, self._cache[candidate], n
                if hyphen_candidate in self._cache:
                    return candidate, self._cache[hyphen_candidate], n

            try:
                cursor.execute(
                    """
                    SELECT m.src, m.dst, m.score, p.name, p.synopsis, p.options, p.dashless_opts, p.nested_cmd, p.subcommands
                    FROM mappings m
                    JOIN parsed_manpages p ON m.dst = p.source
                    WHERE m.src IN (?, ?)
                    ORDER BY m.score DESC, p.source ASC
                    LIMIT 1
                    """,
                    (candidate, hyphen_candidate),
                )
                row = cursor.fetchone()
                if row:
                    src, dst, score, name, synopsis, options_json, dashless, nested, subcmds_json = row
                    manpage_data = self._build_manpage_record(dst, name, synopsis, options_json, dashless, nested, subcmds_json)
                    with self._lock:
                        self._cache[candidate] = manpage_data
                    return candidate, manpage_data, n
            except Exception as e:
                logger.debug(f"Error querying mappings for {candidate}: {e}")

        # Fallback: direct name match in parsed_manpages for single token
        first_token = tokens[0]
        with self._lock:
            if first_token in self._cache:
                return first_token, self._cache[first_token], 1

        try:
            cursor.execute(
                """
                SELECT source, name, synopsis, options, dashless_opts, nested_cmd, subcommands
                FROM parsed_manpages
                WHERE name = ?
                LIMIT 1
                """,
                (first_token,),
            )
            row = cursor.fetchone()
            if row:
                dst, name, synopsis, options_json, dashless, nested, subcmds_json = row
                manpage_data = self._build_manpage_record(dst, name, synopsis, options_json, dashless, nested, subcmds_json)
                with self._lock:
                    self._cache[first_token] = manpage_data
                return first_token, manpage_data, 1
        except Exception as e:
            logger.debug(f"Error querying parsed_manpages for {first_token}: {e}")

        return None, None, 0

    def _build_manpage_record(
        self, source: str, name: str, synopsis: Optional[str], options_json: str, dashless: int, nested: str, subcmds_json: str
    ) -> Dict[str, Any]:
        options_list = json.loads(options_json) if options_json else []
        subcmds = json.loads(subcmds_json) if subcmds_json else []
        
        # Build fast lookup indexes
        short_map: Dict[str, Dict[str, Any]] = {}
        long_map: Dict[str, Dict[str, Any]] = {}
        pos_map: Dict[str, Dict[str, Any]] = {}

        for opt in options_list:
            for s in opt.get("short", []):
                short_map[s] = opt
                if s.startswith("-") and len(s) == 2:
                    short_map[s[1:]] = opt  # allow dashless lookup
            for l in opt.get("long", []):
                long_map[l] = opt
            if opt.get("positional"):
                pos_map[opt["positional"]] = opt

        return {
            "source": source,
            "name": name,
            "synopsis": synopsis or "",
            "options": options_list,
            "dashless": bool(dashless),
            "nested": str(nested).lower() == "true",
            "subcommands": subcmds,
            "short_map": short_map,
            "long_map": long_map,
            "pos_map": pos_map,
        }

    def explain(self, cmd_line: str) -> Optional[CommandExplanation]:
        """
        Parses a command line, separates command from flags, and fetches
        detailed explanation from the explainshell database for ONLY the flags used.
        """
        clean_cmd = cmd_line.strip()
        if not clean_cmd:
            return None

        try:
            tokens = shlex.split(clean_cmd)
        except Exception:
            tokens = clean_cmd.split()

        if not tokens:
            return None

        matched_cmd, manpage_data, consumed = self.resolve_command_manpage(tokens)
        if not manpage_data or not matched_cmd:
            return None

        remaining_tokens = tokens[consumed:]
        used_flags: List[FlagExplanation] = []
        positional_args: List[str] = []

        short_map = manpage_data["short_map"]
        long_map = manpage_data["long_map"]
        pos_map = manpage_data["pos_map"]
        is_dashless = manpage_data["dashless"]
        is_nested_cmd = manpage_data["nested"]

        nested_explanation: Optional[CommandExplanation] = None
        idx = 0

        while idx < len(remaining_tokens):
            tok = remaining_tokens[idx]

            # If this is a nested command wrapper (e.g. sudo, xargs) and we encounter a non-flag token
            if is_nested_cmd and not tok.startswith("-") and "=" not in tok:
                # The remaining tokens represent the nested command
                nested_line = " ".join(remaining_tokens[idx:])
                nested_explanation = self.explain(nested_line)
                break

            # 1. Positional key=value syntax (e.g. dd if=/dev/zero bs=1M count=10)
            if "=" in tok and not tok.startswith("-"):
                key, val = tok.split("=", 1)
                if key in pos_map:
                    opt = pos_map[key]
                    used_flags.append(self._create_flag_explanation(tok, opt, argument_value=val))
                    idx += 1
                    continue

            # 2. Long flags (e.g. --file=foo or --file foo or --all)
            if tok.startswith("--"):
                if "=" in tok:
                    flag_name, val = tok.split("=", 1)
                    opt = long_map.get(flag_name)
                    used_flags.append(self._create_flag_explanation(tok, opt, argument_value=val, fallback_flag=flag_name))
                else:
                    opt = long_map.get(tok)
                    val = None
                    if idx + 1 < len(remaining_tokens) and _should_consume_next_token(opt, remaining_tokens[idx + 1]):
                        idx += 1
                        val = remaining_tokens[idx]
                    used_flags.append(self._create_flag_explanation(tok, opt, argument_value=val))
                idx += 1
                continue

            # 3. Find-style / single-dash multi-character flags (e.g. -name, -type, -exec, -vf, -version)
            if tok.startswith("-") and len(tok) > 2 and tok in short_map:
                opt = short_map[tok]
                val = None
                if idx + 1 < len(remaining_tokens) and _should_consume_next_token(opt, remaining_tokens[idx + 1]):
                    idx += 1
                    val = remaining_tokens[idx]
                used_flags.append(self._create_flag_explanation(tok, opt, argument_value=val))
                idx += 1
                continue

            # 4. Clustered short flags (e.g. -xzvf, -la, -rf, -m"message")
            if tok.startswith("-") and len(tok) > 1 and not tok.startswith("--"):
                chars = tok[1:]
                matched_cluster: List[FlagExplanation] = []
                all_valid = True
                c_idx = 0
                while c_idx < len(chars):
                    c = chars[c_idx]
                    s_flag = f"-{c}"
                    opt = short_map.get(s_flag)
                    if not opt:
                        all_valid = False
                        break
                    
                    if _takes_argument(opt):
                        # Attached argument (e.g. -m"hello" or -farchive.tar or -O3)
                        rest = chars[c_idx + 1:]
                        if rest:
                            matched_cluster.append(self._create_flag_explanation(s_flag, opt, argument_value=rest))
                            c_idx = len(chars)  # all consumed
                        elif idx + 1 < len(remaining_tokens) and _should_consume_next_token(opt, remaining_tokens[idx + 1]):
                            idx += 1
                            val = remaining_tokens[idx]
                            matched_cluster.append(self._create_flag_explanation(s_flag, opt, argument_value=val))
                            c_idx += 1
                        else:
                            matched_cluster.append(self._create_flag_explanation(s_flag, opt, argument_value=None))
                            c_idx += 1
                    else:
                        matched_cluster.append(self._create_flag_explanation(s_flag, opt, argument_value=None))
                        c_idx += 1

                if all_valid:
                    used_flags.extend(matched_cluster)
                    idx += 1
                    continue

            # 5. Dashless options (e.g. tar xvf archive.tar, ps aux)
            if is_dashless and not tok.startswith("-") and not used_flags:
                all_dashless = True
                matched_dashless: List[FlagExplanation] = []
                for c in tok:
                    opt = short_map.get(c) or short_map.get(f"-{c}")
                    if not opt:
                        all_dashless = False
                        break
                    matched_dashless.append(self._create_flag_explanation(c, opt, argument_value=None))
                
                if all_dashless and matched_dashless:
                    used_flags.extend(matched_dashless)
                    idx += 1
                    continue

            # 6. Positional non-flag arguments
            positional_args.append(tok)
            idx += 1

        return CommandExplanation(
            command=matched_cmd,
            manpage_source=manpage_data["source"],
            synopsis=manpage_data["synopsis"],
            used_flags=used_flags,
            positional_args=positional_args,
            nested_command=nested_explanation,
        )

    def _create_flag_explanation(
        self,
        flag: str,
        opt_dict: Optional[Dict[str, Any]],
        argument_value: Optional[str] = None,
        fallback_flag: Optional[str] = None,
    ) -> FlagExplanation:
        if not opt_dict:
            return FlagExplanation(
                flag=flag,
                canonical_name=fallback_flag or flag,
                summary=f"Option '{flag}'",
                description="Option recognized in command invocation.",
                has_argument=bool(argument_value),
                argument_value=argument_value,
                is_matched=False,
            )

        text = opt_dict.get("text", "")
        short_list = opt_dict.get("short", [])
        long_list = opt_dict.get("long", [])
        canonical = _get_canonical_declaration(text, short_list, long_list) or flag
        summary = _clean_markdown_summary(text)
        has_arg = _takes_argument(opt_dict)

        return FlagExplanation(
            flag=flag,
            canonical_name=canonical,
            summary=summary,
            description=text,
            has_argument=has_arg,
            argument_value=argument_value,
            is_matched=True,
        )


# Global singleton instance
_db_instance: Optional[ExplainshellDB] = None


def get_explainshell_db() -> ExplainshellDB:
    """Returns the global ExplainshellDB instance."""
    global _db_instance
    if _db_instance is None:
        _db_instance = ExplainshellDB()
    return _db_instance


def explain_command(cmd_line: str) -> Optional[CommandExplanation]:
    """Convenience function to parse and explain a command line string."""
    db = get_explainshell_db()
    if not db.is_available():
        return None
    return db.explain(cmd_line)
