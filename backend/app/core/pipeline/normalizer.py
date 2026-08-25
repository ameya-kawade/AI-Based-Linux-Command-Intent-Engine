import re
import glob
import base64
import tree_sitter
try:
    import tree_sitter_bash
except ImportError:
    tree_sitter_bash = None

class DeobfuscationEngine:
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
        if not tree_sitter_bash: return command
        self.symbol_table = {}
        self.unresolvable = False
        source = command.encode('utf-8')
        tree = self.parser.parse(source)
        res = self._visit(tree.root_node, source)
        if "UNRESOLVABLE_DYNAMIC_OBFUSCATION" in res: self.unresolvable = True
        return res.strip()

    def _visit(self, node, source: bytes) -> str:
        if node.type == 'variable_assignment':
            name = ""
            val = ""
            for child in node.children:
                if child.type == 'variable_name':
                    name = source[child.start_byte:child.end_byte].decode('utf-8')
                elif child.type in ('string', 'raw_string', 'word', 'concatenation', 'simple_expansion', 'expansion'):
                    val = self._evaluate(child, source)
            if name: self.symbol_table[name] = val
            return ""
            
        elif node.type == 'command':
            args = []
            for child in node.children:
                if child.is_named:
                    v = self._evaluate(child, source)
                    if v: args.append(v)
            if not args: return ""
            if args[0] in ('eval', 'sh', 'bash') and len(args) > 1:
                return self.normalize(args[-1])
            return " ".join(args)

        elif node.type == 'pipeline':
            stages = [c for c in node.children if c.type == 'command']
            if len(stages) == 2:
                a1 = [self._evaluate(c, source) for c in stages[0].children if c.is_named]
                a2 = [self._evaluate(c, source) for c in stages[1].children if c.is_named]
                a1 = [x for x in a1 if x]
                a2 = [x for x in a2 if x]
                if a1 and a1[0] == 'echo' and a2 and a2[0] == 'base64' and '-d' in a2:
                    encoded = " ".join(a1[1:])
                    try:
                        decoded = base64.b64decode(encoded).decode('utf-8')
                        return self.normalize(decoded)
                    except:
                        self.unresolvable = True
                        return "STATE: UNRESOLVABLE_DYNAMIC_OBFUSCATION"
                if a1 and a1[0] == 'echo' and a2 and a2[0] == 'rev':
                    rev_str = " ".join(a1[1:])[::-1]
                    return self.normalize(rev_str)
            res = []
            for c in node.children:
                if c.type == '|': res.append('|')
                else:
                    v = self._visit(c, source)
                    if v: res.append(v)
            return " ".join(res)

        elif node.type == 'command_substitution':
            inner = ""
            for c in node.children:
                if c.type not in ('$(', '`', ')'):
                    v = self._visit(c, source)
                    if v: inner += v + " "
            return f"$({self.normalize(inner)})"

        else:
            res = []
            for c in node.children:
                v = self._visit(c, source)
                if v: res.append(v)
            return " ".join(res) if res else ""

    def _evaluate(self, node, source: bytes) -> str:
        if node.type == 'word':
            val = source[node.start_byte:node.end_byte].decode('utf-8')
            val = val.replace("\\", "")
            if '?' in val or '*' in val:
                matches = glob.glob(val)
                if len(matches) == 1: return matches[0]
            return val
            
        elif node.type == 'string':
            # "c""a""t" -> c a t if we don't concatenate properly.
            # Tree-sitter handles string contents inside the string node.
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
            val = val[2:-1] if val.startswith("$\'") and val.endswith("'") else val
            try:
                return bytes(val, 'utf-8').decode('unicode_escape')
            except Exception:
                return val
            
        elif node.type == 'concatenation':
            return "".join(self._evaluate(c, source) for c in node.children)
            
        elif node.type == 'simple_expansion':
            v = source[node.start_byte+1:node.end_byte].decode('utf-8')
            if v in ('IFS', '{IFS}'): return " "
            return self.symbol_table.get(v, "")
            
        elif node.type == 'expansion':
            v = source[node.start_byte+2:node.end_byte-1].decode('utf-8')
            if v == 'IFS': return " "
            if ':' in v:
                parts = v.split(':')
                val = self.symbol_table.get(parts[0], "")
                try:
                    start = int(parts[1])
                    if len(parts) == 3: return val[start:start+int(parts[2])]
                    return val[start:]
                except: return val
            return self.symbol_table.get(v, "")
            
        elif node.type == 'string_content':
            return source[node.start_byte:node.end_byte].decode('utf-8')
            
        elif node.type == 'command_name':
            return self._evaluate(node.children[0], source) if node.children else ""
            
        elif node.type in ('command', 'pipeline'):
            return self._visit(node, source)
            
        res = ""
        for c in node.children:
            if c.is_named: res += self._evaluate(c, source)
        return res or source[node.start_byte:node.end_byte].decode('utf-8')
