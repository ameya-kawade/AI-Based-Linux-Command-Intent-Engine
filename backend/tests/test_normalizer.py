import pytest
from app.core.pipeline.normalizer import DeobfuscationEngine

def test_lexical_quote_flattening():
    engine = DeobfuscationEngine()
    cmd = "w'h'o'am'i"
    assert engine.normalize(cmd) == "whoami"
    
    cmd = '"c""a""t"'
    assert engine.normalize(cmd) == "cat"
    
    cmd = "\\c\\a\\t"
    assert engine.normalize(cmd) == "cat"
    
def test_ifs_canonicalization():
    engine = DeobfuscationEngine()
    cmd = "cat$IFS/etc/passwd"
    assert engine.normalize(cmd) == "cat /etc/passwd"
    
def test_variable_inlining():
    engine = DeobfuscationEngine()
    cmd = "a='w'; b='hoami'; $a$b"
    assert engine.normalize(cmd) == "whoami"

def test_base64_decoding():
    engine = DeobfuscationEngine()
    cmd = "echo 'd2hvYW1p' | base64 -d"
    assert engine.normalize(cmd) == "whoami"

def test_subshell_unnesting():
    engine = DeobfuscationEngine()
    cmd = "$(echo 'imaohw' | rev)"
    # Depending on how pipeline unnesting is implemented, it might return whoami or $(whoami)
    assert engine.normalize(cmd) in ("whoami", "$(whoami)")

def test_ansic_quoting():
    engine = DeobfuscationEngine()
    cmd = "printf $'\\x77\\x68\\x6f\\x61\\x6d\\x69'"
    assert engine.normalize(cmd) == "printf whoami"
