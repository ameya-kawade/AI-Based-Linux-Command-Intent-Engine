import re
import os
import glob
import base64
import tree_sitter
try:
    import tree_sitter_bash
except ImportError:
    tree_sitter_bash = None

COMMON_UTILITIES = {
    'cat', 'bash', 'sh', 'python', 'python3', 'perl', 'ruby', 'nc', 'netcat', 'ncat',
    'curl', 'wget', 'chmod', 'chown', 'rm', 'mv', 'cp', 'find', 'grep', 'sed', 'awk',
    'whoami', 'id', 'uname', 'dd', 'sudo', 'su', 'tar', 'gzip', 'bzip2', 'xz'
}


class DeobfuscationEngine:
    """
    Deterministic, high-throughput Linux Command Normalization and De-Obfuscation Engine.
    Operates via tree-sitter AST and multi-pass normalization passes:
    1. Lexical quote flattening & ANSI-C decoding
    2. Delimiter & $IFS canonicalization, brace expansion
    3. Symbolic constant propagation & uninitialized var stripping
    4. Static decoding (Base64, Hex/Octal, Rev)
    5. Path canonicalization & Glob resolution
    6. Wrapper unnesting & Subshell extraction
    7. Dynamic evasion state tagging (STATE: UNRESOLVABLE_DYNAMIC_OBFUSCATION)
    """

    def __init__(self):
        self.parser = tree_sitter.Parser()
        if tree_sitter_bash:
            try:
                lang = tree_sitter.Language(tree_sitter_bash.language())
                self.parser.set_language(lang)
            except Exception:
                lang = tree_sitter.Language(tree_sitter_bash.language(), "bash")
                self.parser.set_language(lang)
        self.symbol_table = {}
        self.unresolvable = False

    def normalize(self, command: str) -> str:
        if not command or not command.strip():
            return ""
        if not tree_sitter_bash:
            return command.strip()

        self.symbol_table = {}
        self.unresolvable = False

        cmd_clean = command.strip()

        # Check for remote pipe execution (e.g. curl ... | bash, wget ... | sh)
        if re.search(r'\b(curl|wget|fetch|nc|ncat|netcat)\b.*\|\s*(ba|z|da|k)?sh\b', cmd_clean, re.IGNORECASE):
            self.unresolvable = True
            return f"{cmd_clean} (STATE: UNRESOLVABLE_DYNAMIC_OBFUSCATION)"

        # Check for dynamic network descriptors (e.g. /dev/tcp/...)
        if '/dev/tcp/' in cmd_clean or '/dev/udp/' in cmd_clean:
            self.unresolvable = True

        # Pre-pass: Resolve deterministic command brace expansions {cmd,arg1,arg2}
        cmd_clean = self._expand_command_braces(cmd_clean)

        source = cmd_clean.encode('utf-8')
        tree = self.parser.parse(source)

        res = self._visit(tree.root_node, source)

        # Normalize redundant spaces
        res = " ".join(res.split())

        # Cleanup file descriptor redirection formatting like "0 >& 1" -> "0>&1"
        res = re.sub(r'([0-9])\s+([><]&?)\s*([0-9])', r'\1\2\3', res)
        res = re.sub(r'([0-9])\s+([><]&?)([0-9])', r'\1\2\3', res)

        if self.unresolvable and "UNRESOLVABLE_DYNAMIC_OBFUSCATION" not in res:
            res = f"{res} (STATE: UNRESOLVABLE_DYNAMIC_OBFUSCATION)"

        return res.strip()

    def _expand_command_braces(self, cmd: str) -> str:
        """Expands {cmd,arg1,arg2} -> cmd arg1 arg2 when used as a command structure."""
        m = re.match(r'^\s*\{([^{}]+)\}\s*$', cmd)
        if m:
            parts = [p.strip() for p in m.group(1).split(',') if p.strip()]
            if len(parts) > 1:
                return " ".join(parts)
        return cmd

    def _resolve_glob(self, pattern: str) -> str:
        """Resolves glob path patterns deterministically."""
        if '?' not in pattern and '*' not in pattern:
            return pattern
        matches = glob.glob(pattern)
        if not matches:
            return pattern
        if len(matches) == 1:
            return matches[0]
        # If multiple matches, check for common standard utilities
        for m in matches:
            base = os.path.basename(m)
            if base in COMMON_UTILITIES:
                return m
        return matches[0]

    def _visit(self, node, source: bytes) -> str:
        if node.type == 'variable_assignment':
            name = ""
            val = ""
            for child in node.children:
                if child.type == 'variable_name':
                    name = source[child.start_byte:child.end_byte].decode('utf-8')
                elif child.type in ('string', 'raw_string', 'word', 'concatenation', 'simple_expansion', 'expansion', 'number'):
                    val = self._evaluate(child, source)
            if name:
                self.symbol_table[name] = val
            return ""

        elif node.type == 'command':
            args = []
            for child in node.children:
                if child.is_named:
                    v = self._evaluate(child, source)
                    if v:
                        args.append(v)
            if not args:
                return ""

            cmd_name = args[0]

            # Wrapper unnesting: eval, sh -c, bash -c, sudo, nohup
            if cmd_name in ('eval', 'sh', 'bash') and len(args) > 1:
                if cmd_name in ('sh', 'bash') and '-c' in args:
                    idx = args.index('-c')
                    if idx + 1 < len(args):
                        return self.normalize(args[idx + 1])
                elif cmd_name == 'eval':
                    return self.normalize(" ".join(args[1:]))

            # Check printf hex / octal decoding
            if cmd_name == 'printf' and len(args) > 1:
                fmt_str = args[1]
                if re.search(r'(\\x[0-9a-fA-F]{2}|\\[0-7]{1,3})', fmt_str):
                    decoded = self._decode_escapes(fmt_str)
                    return f"printf {decoded}"

            return " ".join(args)

        elif node.type == 'redirected_statement':
            parts = []
            for child in node.children:
                if child.type == 'command':
                    v = self._visit(child, source)
                    if v:
                        parts.append(v)
                elif child.type in ('file_redirect', 'heredoc_redirect'):
                    redir_str = self._visit_redirect(child, source)
                    if redir_str:
                        parts.append(redir_str)
            return " ".join(parts)

        elif node.type == 'pipeline':
            stages = [c for c in node.children if c.type in ('command', 'redirected_statement')]
            # Check for static decoder pipelines: echo "..." | base64 -d, rev
            if len(stages) == 2:
                s1_text = self._visit(stages[0], source)
                s2_text = self._visit(stages[1], source)
                a1 = s1_text.split()
                a2 = s2_text.split()

                if a1 and a1[0] in ('echo', 'printf') and a2 and a2[0] == 'base64' and any(f in a2 for f in ('-d', '--decode', '-D')):
                    encoded_payload = " ".join(a1[1:]).strip('\'"')
                    try:
                        decoded = base64.b64decode(encoded_payload).decode('utf-8')
                        return self.normalize(decoded)
                    except Exception:
                        self.unresolvable = True
                        return "STATE: UNRESOLVABLE_DYNAMIC_OBFUSCATION"

                if a1 and a1[0] in ('echo', 'printf') and a2 and a2[0] == 'rev':
                    rev_payload = " ".join(a1[1:]).strip('\'"')
                    decoded = rev_payload[::-1]
                    return self.normalize(decoded)

            res = []
            for c in node.children:
                if c.type == '|':
                    res.append('|')
                elif c.type == '|&':
                    res.append('|&')
                else:
                    v = self._visit(c, source)
                    if v:
                        res.append(v)
            return " ".join(res)

        elif node.type == 'command_substitution':
            inner = ""
            for c in node.children:
                if c.type not in ('$(', '`', ')'):
                    v = self._visit(c, source)
                    if v:
                        inner += v + " "
            norm_inner = self.normalize(inner)
            return f"$({norm_inner})"

        else:
            res = []
            for c in node.children:
                v = self._visit(c, source)
                if v:
                    res.append(v)
            return " ".join(res) if res else ""

    def _visit_redirect(self, node, source: bytes) -> str:
        """Canonicalizes I/O redirection nodes (e.g. < /etc/passwd, > file, >& /dev/tcp/...)."""
        tokens = []
        for child in node.children:
            val = source[child.start_byte:child.end_byte].decode('utf-8').strip()
            if child.type == 'word':
                val = self._evaluate(child, source)
            tokens.append(val)

        # Recombine redirection operators (e.g. ['<', '/etc/passwd'] -> '< /etc/passwd', ['>&', '1'] -> '>&1')
        if len(tokens) == 2:
            op, target = tokens
            if target.isdigit():
                return f"{op}{target}"
            return f"{op} {target}"
        return " ".join(tokens)

    def _decode_escapes(self, val: str) -> str:
        """Resolves hex and octal escape sequences."""
        val = re.sub(r'\\x([0-9a-fA-F]{2})', lambda m: chr(int(m.group(1), 16)), val)
        val = re.sub(r'\\([0-7]{1,3})', lambda m: chr(int(m.group(1), 8)), val)
        return val

    def _evaluate(self, node, source: bytes) -> str:
        if node.type == 'word':
            val = source[node.start_byte:node.end_byte].decode('utf-8')
            # Strip literal non-functional backslashes (\c\a\t -> cat)
            val = val.replace("\\", "")

            # Glob resolution (/b?n/c?t -> /bin/cat)
            if '?' in val or '*' in val:
                val = self._resolve_glob(val)

            # Path normalization (/bin/../bin//whoami -> /bin/whoami)
            if '/' in val and not val.startswith('http'):
                val = os.path.normpath(val)

            return val

        elif node.type == 'string':
            # "c""a""t" -> cat
            inner = ""
            for c in node.children:
                if c.type not in ('"', "'"):
                    inner += self._evaluate(c, source)
            return inner

        elif node.type == 'raw_string':
            val = source[node.start_byte:node.end_byte].decode('utf-8')
            return val[1:-1] if val.startswith("'") and val.endswith("'") else val

        elif node.type == 'ansi_c_string':
            val = source[node.start_byte:node.end_byte].decode('utf-8')
            val = val[2:-1] if val.startswith("$'") and val.endswith("'") else val
            try:
                return bytes(val, 'utf-8').decode('unicode_escape')
            except Exception:
                return self._decode_escapes(val)

        elif node.type == 'concatenation':
            # Resolve concatenation of tokens (e.g. cat + $IFS + /etc/passwd or a + b)
            parts = []
            for c in node.children:
                eval_c = self._evaluate(c, source)
                parts.append(eval_c)

            res = "".join(parts)

            # Path normalization if contains path separators
            if '/' in res and not res.startswith('http'):
                # If it has spaces (e.g. from $IFS), normalize each space-separated segment
                if ' ' in res:
                    segments = res.split()
                    norm_segments = [self._resolve_glob(s) if ('?' in s or '*' in s) else s for s in segments]
                    norm_segments = [os.path.normpath(s) if '/' in s else s for s in norm_segments]
                    res = " ".join(norm_segments)
                else:
                    if '?' in res or '*' in res:
                        res = self._resolve_glob(res)
                    res = os.path.normpath(res)
            return res

        elif node.type == 'simple_expansion':
            # $IFS, $u, $var
            v = source[node.start_byte+1:node.end_byte].decode('utf-8')
            if v in ('IFS', '{IFS}'):
                return " "
            return self.symbol_table.get(v, "")

        elif node.type == 'expansion':
            # ${IFS}, ${var}, ${var:0:1}
            v = source[node.start_byte+2:node.end_byte-1].decode('utf-8')
            if v == 'IFS':
                return " "
            # Parameter substring slicing: ${var:offset:length}
            if ':' in v:
                parts = v.split(':')
                var_name = parts[0]
                val = self.symbol_table.get(var_name, "")
                try:
                    start = int(parts[1])
                    if len(parts) == 3:
                        return val[start:start+int(parts[2])]
                    return val[start:]
                except Exception:
                    return val
            return self.symbol_table.get(v, "")

        elif node.type == 'string_content':
            return source[node.start_byte:node.end_byte].decode('utf-8')

        elif node.type == 'command_name':
            if node.children:
                val = self._evaluate(node.children[0], source)
                # If command name has path glob (e.g. /b?n/c?t)
                if '?' in val or '*' in val:
                    val = self._resolve_glob(val)
                if '/' in val:
                    val = os.path.normpath(val)
                return val
            return ""

        elif node.type in ('command', 'pipeline', 'redirected_statement'):
            return self._visit(node, source)

        res = ""
        for c in node.children:
            if c.is_named:
                res += self._evaluate(c, source)
        return res or source[node.start_byte:node.end_byte].decode('utf-8')
