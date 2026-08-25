import tree_sitter_bash
import tree_sitter

parser = tree_sitter.Parser()
try:
    language = tree_sitter.Language(tree_sitter_bash.language())
    parser.set_language(language)
except Exception:
    language = tree_sitter.Language(tree_sitter_bash.language(), 'bash')
    parser.set_language(language)

source_code = b'a="w"; b="hoami"; $a$b'
tree = parser.parse(source_code)

def print_tree(node, depth=0):
    indent = "  " * depth
    print(f"{indent}{node.type} [{node.start_byte}:{node.end_byte}] '{source_code[node.start_byte:node.end_byte].decode()}'")
    for child in node.children:
        print_tree(child, depth + 1)

print_tree(tree.root_node)
