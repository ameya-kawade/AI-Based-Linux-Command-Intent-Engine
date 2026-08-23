import json
import logging
import os
import re
import sqlite3
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import shlex
from bs4 import BeautifulSoup

from app.core.models import CommandExplanation, FlagExplanation

logger = logging.getLogger(__name__)

CACHE_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "man7_cache.sqlite"
CACHE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)


class Man7GroundTruthEngine:
    """
    Ground-truth manual page provider fetching and parsing official Linux/POSIX
    manpages from https://man7.org/linux/man-pages/.
    Extracts command synopses and flag-level descriptions with robust BeautifulSoup
    and text layout parsing, cached in local SQLite.
    """

    def __init__(self, cache_path: Optional[Path] = None):
        self.cache_path = cache_path or CACHE_DB_PATH
        self._init_db()
        self._memory_cache: Dict[str, Dict[str, Any]] = {}

    def _init_db(self) -> None:
        try:
            with sqlite3.connect(self.cache_path) as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS man7_pages (
                        command TEXT PRIMARY KEY,
                        url TEXT NOT NULL,
                        synopsis TEXT,
                        name_raw TEXT,
                        options_json TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                conn.commit()
        except Exception as e:
            logger.warning(f"Could not initialize man7 SQLite cache at {self.cache_path}: {e}")

    def clear_cache(self) -> None:
        """Clears in-memory and persistent SQLite caches."""
        self._memory_cache.clear()
        try:
            with sqlite3.connect(self.cache_path) as conn:
                conn.execute("DELETE FROM man7_pages")
                conn.commit()
        except Exception:
            pass

    def _get_from_cache(self, cmd_name: str) -> Optional[Dict[str, Any]]:
        if cmd_name in self._memory_cache:
            return self._memory_cache[cmd_name]

        try:
            with sqlite3.connect(self.cache_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT url, synopsis, name_raw, options_json FROM man7_pages WHERE command = ?",
                    (cmd_name.lower(),),
                )
                row = cursor.fetchone()
                if row:
                    url, synopsis, name_raw, options_json = row
                    data = {
                        "command": cmd_name,
                        "url": url,
                        "synopsis": synopsis or "",
                        "name": name_raw or "",
                        "options": json.loads(options_json) if options_json else {},
                    }
                    self._memory_cache[cmd_name] = data
                    return data
        except Exception as e:
            logger.debug(f"Man7 cache lookup error: {e}")
        return None

    def _save_to_cache(self, cmd_name: str, data: Dict[str, Any]) -> None:
        self._memory_cache[cmd_name] = data
        try:
            with sqlite3.connect(self.cache_path) as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO man7_pages (command, url, synopsis, name_raw, options_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        cmd_name.lower(),
                        data.get("url", ""),
                        data.get("synopsis", ""),
                        data.get("name", ""),
                        json.dumps(data.get("options", {})),
                    ),
                )
                conn.commit()
        except Exception as e:
            logger.debug(f"Could not persist man7 page to cache: {e}")

    def fetch_manpage(self, cmd_name: str) -> Optional[Dict[str, Any]]:
        """Fetches and parses the official man7.org manpage for a command."""
        clean_name = cmd_name.strip().lower()
        if not clean_name:
            return None

        # Check local cache first
        cached = self._get_from_cache(clean_name)
        if cached:
            return cached

        candidates = [
            f"https://man7.org/linux/man-pages/man1/{clean_name}.1.html",   # Standard Linux/GNU section 1
            f"https://man7.org/linux/man-pages/man1/{clean_name}.1p.html",  # POSIX section 1 (e.g. awk)
            f"https://man7.org/linux/man-pages/man8/{clean_name}.8.html",  # System administration section 8 (e.g. iptables)
            f"https://man7.org/linux/man-pages/man5/{clean_name}.5.html",  # File formats section 5
        ]

        same_line_regex = re.compile(
            r"^\s{4,10}(-[a-zA-Z0-9_\-]+(?:\s*,\s*(?:-[a-zA-Z0-9_\-]+|--[a-zA-Z0-9_\-]+))*)\s{2,}([A-Za-z0-9`'\"].*)$"
        )
        multi_hdr_regex = re.compile(
            r"^\s{4,10}(-[a-zA-Z0-9_\-]+(?:[ =\[][^,\n]+)?(?:\s*,\s*(?:-[a-zA-Z0-9_\-]+|--[a-zA-Z0-9_\-]+)(?:[ =\[][^\n,]+)?)*)\s*$"
        )

        for url in candidates:
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "LinuxCommandIntentEngine/1.0 (man7 fetcher; +https://github.com)"},
                )
                with urllib.request.urlopen(req, timeout=3.5) as resp:
                    if resp.status == 200:
                        html = resp.read().decode("utf-8", errors="ignore")
                        soup = BeautifulSoup(html, "html.parser")
                        sections: Dict[str, str] = {}

                        for h2 in soup.find_all("h2"):
                            title = re.sub(r"\s+top$", "", h2.get_text().strip(), flags=re.IGNORECASE).strip()
                            nxt = h2.find_next_sibling("pre")
                            if nxt:
                                sections[title] = nxt.get_text()

                        name_raw = sections.get("NAME", "").strip()
                        synopsis_raw = sections.get("SYNOPSIS", "").strip()
                        desc_raw = sections.get("DESCRIPTION", "").strip()
                        opts_raw = sections.get("OPTIONS", "")

                        # Clean synopsis
                        synopsis_clean = " ".join(name_raw.split())
                        if "—" in synopsis_clean:
                            _, syn_part = synopsis_clean.split("—", 1)
                            synopsis_clean = syn_part.strip()
                        elif "-" in synopsis_clean:
                            parts = synopsis_clean.split("-", 1)
                            if len(parts) > 1 and parts[0].strip() == clean_name:
                                synopsis_clean = parts[1].strip()

                        if not synopsis_clean and synopsis_raw:
                            synopsis_clean = " ".join(synopsis_raw.split()[:20])

                        # Combine DESCRIPTION and OPTIONS text to capture all modes and flags
                        combined_text = desc_raw + "\n" + opts_raw
                        options_map: Dict[str, Dict[str, Any]] = {}
                        lines = combined_text.split("\n")
                        current_flags: List[str] = []
                        current_desc: List[str] = []

                        def commit_option():
                            if current_flags and current_desc:
                                desc_text = " ".join(" ".join(current_desc).split())
                                if desc_text:
                                    summary = desc_text.split(". ")[0] + ("." if "." in desc_text else "")
                                    if len(summary) > 160:
                                        summary = summary[:157] + "..."
                                    for fl in current_flags:
                                        token = fl.split()[0].split("=")[0].strip(", ")
                                        options_map[token] = {
                                            "flag": token,
                                            "canonical": ", ".join(current_flags),
                                            "summary": summary,
                                            "description": desc_text,
                                            "has_argument": bool(" " in fl or "=" in fl or "<" in fl or "[" in fl),
                                        }

                        for line in lines:
                            m_same = same_line_regex.match(line)
                            if m_same:
                                commit_option()
                                hdr = m_same.group(1).strip()
                                inline_desc = m_same.group(2).strip()
                                current_flags = [p.strip() for p in hdr.split(",") if p.strip()]
                                current_desc = [inline_desc]
                                continue

                            m_multi = multi_hdr_regex.match(line)
                            if m_multi:
                                commit_option()
                                hdr = m_multi.group(1).strip()
                                current_flags = [p.strip() for p in hdr.split(",") if p.strip()]
                                current_desc = []
                            elif current_flags:
                                stripped = line.strip()
                                if stripped:
                                    current_desc.append(stripped)
                                elif current_desc:
                                    current_desc.append("")
                        commit_option()

                        data = {
                            "command": clean_name,
                            "url": url,
                            "name": name_raw,
                            "synopsis": synopsis_clean,
                            "options": options_map,
                        }
                        self._save_to_cache(clean_name, data)
                        logger.info(f"Fetched and cached man7.org manpage for '{clean_name}' ({url}) with {len(options_map)} options")
                        return data
            except Exception as e:
                logger.debug(f"Candidate man7 URL '{url}' failed: {e}")

        return None

    def explain(self, cmd_line: str) -> Optional[CommandExplanation]:
        """Parses a command line string and extracts manpage descriptions from man7.org."""
        clean_cmd = cmd_line.strip()
        if not clean_cmd:
            return None

        try:
            tokens = shlex.split(clean_cmd)
        except Exception:
            tokens = clean_cmd.split()

        if not tokens:
            return None

        # Filter out common prefix wrappers like sudo, env, etc.
        cmd_idx = 0
        wrapper_prefixes = ["sudo", "doas", "nohup", "time", "strace", "authbind"]
        while cmd_idx < len(tokens) and tokens[cmd_idx] in wrapper_prefixes:
            cmd_idx += 1

        if cmd_idx >= len(tokens):
            return None

        base_cmd = tokens[cmd_idx]
        man_data = self.fetch_manpage(base_cmd)
        if not man_data:
            return None

        options_map = man_data.get("options", {})
        used_flags: List[FlagExplanation] = []
        positional_args: List[str] = []

        remaining = tokens[cmd_idx + 1 :]
        i = 0
        while i < len(remaining):
            tok = remaining[i]

            # 1. Long options --flag or --flag=value
            if tok.startswith("--"):
                if "=" in tok:
                    flag_name, val = tok.split("=", 1)
                    opt = options_map.get(flag_name)
                    if opt:
                        used_flags.append(
                            FlagExplanation(
                                flag=tok,
                                canonical_name=opt.get("canonical", flag_name),
                                summary=opt.get("summary", f"Option {flag_name}"),
                                description=opt.get("description", ""),
                                has_argument=True,
                                argument_value=val,
                                is_matched=True,
                            )
                        )
                    else:
                        used_flags.append(
                            FlagExplanation(
                                flag=tok,
                                canonical_name=flag_name,
                                summary=f"Option {flag_name}",
                                description=f"Option passed with value '{val}'",
                                has_argument=True,
                                argument_value=val,
                                is_matched=False,
                            )
                        )
                else:
                    opt = options_map.get(tok)
                    val = None
                    if opt and opt.get("has_argument") and i + 1 < len(remaining) and not remaining[i + 1].startswith("-"):
                        i += 1
                        val = remaining[i]
                    
                    if opt:
                        used_flags.append(
                            FlagExplanation(
                                flag=tok,
                                canonical_name=opt.get("canonical", tok),
                                summary=opt.get("summary", f"Option {tok}"),
                                description=opt.get("description", ""),
                                has_argument=bool(val),
                                argument_value=val,
                                is_matched=True,
                            )
                        )
                    else:
                        used_flags.append(
                            FlagExplanation(
                                flag=tok,
                                canonical_name=tok,
                                summary=f"Option {tok}",
                                description="Unmatched command flag.",
                                has_argument=False,
                                argument_value=None,
                                is_matched=False,
                            )
                        )
                i += 1
                continue

            # 2. Clustered or single short options -v, -la, -F:, -f file
            if tok.startswith("-") and len(tok) > 1 and not tok.startswith("--"):
                # Single flag match (e.g. -F, -v, -f)
                if tok in options_map:
                    opt = options_map[tok]
                    val = None
                    if opt.get("has_argument") and i + 1 < len(remaining) and not remaining[i + 1].startswith("-"):
                        i += 1
                        val = remaining[i]
                    used_flags.append(
                        FlagExplanation(
                            flag=tok,
                            canonical_name=opt.get("canonical", tok),
                            summary=opt.get("summary", f"Flag {tok}"),
                            description=opt.get("description", ""),
                            has_argument=bool(val),
                            argument_value=val,
                            is_matched=True,
                        )
                    )
                else:
                    # Check attached argument (e.g. -F: or -farchive.tar or -O3)
                    single_c = tok[:2]
                    rest = tok[2:]
                    if single_c in options_map and options_map[single_c].get("has_argument") and rest:
                        opt = options_map[single_c]
                        used_flags.append(
                            FlagExplanation(
                                flag=single_c,
                                canonical_name=opt.get("canonical", single_c),
                                summary=opt.get("summary", f"Flag {single_c}"),
                                description=opt.get("description", ""),
                                has_argument=True,
                                argument_value=rest,
                                is_matched=True,
                            )
                        )
                    else:
                        # Clustered short flags (e.g. -czvf, -la)
                        chars = tok[1:]
                        matched_cluster = []
                        all_found = True
                        for c in chars:
                            flag_key = f"-{c}"
                            if flag_key in options_map:
                                opt = options_map[flag_key]
                                matched_cluster.append(
                                    FlagExplanation(
                                        flag=flag_key,
                                        canonical_name=opt.get("canonical", flag_key),
                                        summary=opt.get("summary", f"Flag {flag_key}"),
                                        description=opt.get("description", ""),
                                        has_argument=False,
                                        argument_value=None,
                                        is_matched=True,
                                    )
                                )
                            else:
                                all_found = False
                                break
                        if all_found and matched_cluster:
                            used_flags.extend(matched_cluster)
                        else:
                            used_flags.append(
                                FlagExplanation(
                                    flag=tok,
                                    canonical_name=tok,
                                    summary=f"Flag {tok}",
                                    description="Command flag parameter.",
                                    has_argument=False,
                                    argument_value=None,
                                    is_matched=False,
                                )
                            )
                i += 1
                continue

            # 3. Positional argument
            positional_args.append(tok)
            i += 1

        return CommandExplanation(
            command=base_cmd,
            manpage_source=f"man7.org ({man_data.get('url', '').split('/')[-1]})",
            manpage_url=man_data.get("url"),
            synopsis=man_data.get("synopsis", ""),
            used_flags=used_flags,
            positional_args=positional_args,
        )


# Global singleton
_man7_engine: Optional[Man7GroundTruthEngine] = None


def get_man7_engine() -> Man7GroundTruthEngine:
    global _man7_engine
    if _man7_engine is None:
        _man7_engine = Man7GroundTruthEngine()
    return _man7_engine
