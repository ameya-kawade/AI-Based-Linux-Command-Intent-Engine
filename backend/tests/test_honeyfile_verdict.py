import pytest
from app.core.models import HoneyFileDetail, HoneyFileVerdict, ScriptAnalysisVerdict, IntentAnalysis, TraceeAlert
from app.core.pipeline.coordinator import PipelineCoordinator
from app.core.pipeline.base import PipelineContext
from app.core.pipeline.llm_tool import LLMAnalyzerTool

def test_honey_file_verdict_model():
    detail = HoneyFileDetail(
        path="/etc/shadow",
        action="read",
        category="password_hash_theft",
        severity="CRITICAL",
        mitre_attack="T1003.008",
        tier=1,
        detected_by_process="cat",
        tracee_event="openat"
    )
    assert detail.path == "/etc/shadow"
    assert detail.action == "read"
    assert detail.severity == "CRITICAL"

    verdict = HoneyFileVerdict(
        triggered=True,
        total_honey_files=35,
        files_accessed=1,
        files_modified=0,
        files_deleted=0,
        highest_severity="CRITICAL",
        summary="Script READ 1 honey file(s): /etc/shadow.",
        details=[detail]
    )
    assert verdict.triggered is True
    assert len(verdict.details) == 1
    assert verdict.highest_severity == "CRITICAL"

def test_coordinator_blocks_on_honey_trigger():
    coordinator = PipelineCoordinator(tools=[])
    
    honey_verdict = HoneyFileVerdict(
        triggered=True,
        total_honey_files=35,
        files_accessed=1,
        highest_severity="CRITICAL",
        summary="Script READ 1 honey file(s): /root/.ssh/id_rsa.",
        details=[
            HoneyFileDetail(
                path="/root/.ssh/id_rsa",
                action="read",
                category="ssh_credential_theft",
                severity="CRITICAL",
                mitre_attack="T1552.004",
                tier=1,
                detected_by_process="cat"
            )
        ]
    )

    script_verdict = ScriptAnalysisVerdict(
        script_name="steal.sh",
        script_detected_in_command=True,
        script_content_provided=True,
        is_malicious=True,
        severity="CRITICAL",
        honey_file_verdict=honey_verdict
    )

    context = PipelineContext(command="bash steal.sh")
    context.script_verdict = script_verdict

    result = coordinator._synthesize(context)

    assert result.risk_level == "CRITICAL"
    assert result.execution_decision == "BLOCK"
    assert result.is_reversible is False
    assert any("Honey File" in w for w in result.warnings)

def test_llm_prompt_includes_honey_results():
    synthesizer = LLMAnalyzerTool()
    
    honey_verdict = HoneyFileVerdict(
        triggered=True,
        total_honey_files=35,
        files_accessed=1,
        highest_severity="CRITICAL",
        summary="Script READ 1 honey file(s): /root/.aws/credentials.",
        details=[
            HoneyFileDetail(
                path="/root/.aws/credentials",
                action="read",
                category="cloud_credential_theft",
                severity="CRITICAL",
                mitre_attack="T1552.001",
                tier=1,
                detected_by_process="cat"
            )
        ]
    )

    script_verdict = ScriptAnalysisVerdict(
        script_name="cloud_scrape.sh",
        script_detected_in_command=True,
        script_content_provided=True,
        is_malicious=True,
        severity="CRITICAL",
        honey_file_verdict=honey_verdict
    )

    context = PipelineContext(command="bash cloud_scrape.sh")
    context.script_verdict = script_verdict

    prompt = synthesizer._build_user_prompt(context)
    assert "HONEY FILE TRAP RESULTS:" in prompt
    assert "/root/.aws/credentials" in prompt
    assert "T1552.001" in prompt
