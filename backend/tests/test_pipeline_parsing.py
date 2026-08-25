import pytest
from app.core.pipeline.parser import PipelineCommandParser
from app.core.pipeline.explainshell_tool import ExplainshellTool
from app.core.pipeline.base import PipelineContext
from app.core.analyzer import AnalyzerService


def test_parser_pipeline_stages_split():
    cmd = 'find / -name "*.tmp" | xargs rm -rf'
    stages = PipelineCommandParser.split_pipeline_stages(cmd)
    assert len(stages) == 2
    assert stages[0][0] == 'find / -name "*.tmp"'
    assert stages[0][1] == '|'
    assert stages[1][0] == 'xargs rm -rf'
    assert stages[1][1] is None


def test_parser_complex_operators():
    cmd = 'cat file.txt | grep foo && rm bar.txt || echo failed ; ls -la'
    stages = PipelineCommandParser.split_pipeline_stages(cmd)
    assert len(stages) == 5
    assert [s[1] for s in stages] == ['|', '&&', '||', ';', None]
    assert [s[0] for s in stages] == ['cat file.txt', 'grep foo', 'rm bar.txt', 'echo failed', 'ls -la']


def test_parser_operator_metadata():
    pipe_info = PipelineCommandParser.get_operator_info('|')
    assert pipe_info.operator == '|'
    assert 'Pipe' in pipe_info.name
    assert 'stdout' in pipe_info.description.lower()

    and_info = PipelineCommandParser.get_operator_info('&&')
    assert and_info.operator == '&&'
    assert 'Logical AND' in and_info.name

    or_info = PipelineCommandParser.get_operator_info('||')
    assert or_info.operator == '||'
    assert 'Logical OR' in or_info.name


def test_parser_wrapper_decomposition():
    wrapper, wrap_toks, nested = PipelineCommandParser.decompose_wrapper_command('xargs rm -rf')
    assert wrapper == 'xargs'
    assert wrap_toks == ['xargs']
    assert nested == 'rm -rf'

    wrapper, wrap_toks, nested = PipelineCommandParser.decompose_wrapper_command('sudo -u www-data systemctl restart nginx')
    assert wrapper == 'sudo'
    assert wrap_toks == ['sudo', '-u', 'www-data']
    assert nested == 'systemctl restart nginx'


@pytest.mark.asyncio
async def test_explainshell_tool_pipeline_stages():
    tool = ExplainshellTool()
    ctx = PipelineContext(command='find / -name "*.tmp" | xargs rm -rf')
    await tool.process(ctx)

    assert len(ctx.pipeline_stages) == 2
    
    # Stage 0: find
    stage0 = ctx.pipeline_stages[0]
    assert stage0.command_explanation.command == 'find'
    assert any(f.flag == '-name' for f in stage0.command_explanation.used_flags)
    assert stage0.trailing_operator is not None
    assert stage0.trailing_operator.operator == '|'

    # Stage 1: xargs -> rm
    stage1 = ctx.pipeline_stages[1]
    assert stage1.command_explanation.command == 'xargs'
    assert stage1.command_explanation.nested_command is not None
    assert stage1.command_explanation.nested_command.command == 'rm'
    assert any(f.flag in ('-r', '-f') for f in stage1.command_explanation.nested_command.used_flags)
    assert stage1.trailing_operator is None

    assert len(ctx.pipeline_operators) == 1
    assert ctx.pipeline_operators[0].operator == '|'


@pytest.mark.asyncio
async def test_analyzer_multi_command_pipeline_synthesis():
    analyzer = AnalyzerService()
    analysis = await analyzer.analyze('find / -name "*.tmp" | xargs rm -rf')

    assert analysis.command == 'find / -name "*.tmp" | xargs rm -rf'
    assert len(analysis.pipeline_stages) == 2
    assert len(analysis.pipeline_operators) == 1
    assert analysis.pipeline_operators[0].operator == '|'
    assert analysis.risk_level in ('CAUTION', 'CRITICAL')
    assert analysis.pipeline_stages[1].command_explanation.nested_command.command == 'rm'
