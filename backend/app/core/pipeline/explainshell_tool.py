import logging
from typing import List, Optional

from app.core.explainshell_db import get_explainshell_db
from app.core.man7_scraper import get_man7_engine
from app.core.models import CommandExplanation, PipelineStage, PipelineOperatorInfo
from app.core.pipeline.base import BasePipelineTool, PipelineContext
from app.core.pipeline.parser import PipelineCommandParser

logger = logging.getLogger(__name__)


class ExplainshellTool(BasePipelineTool):
    """
    Pipeline tool extracting ground-truth manpage synopses, flag-level documentation,
    and operator relationships for compound shell pipelines, chained commands, and wrappers.
    """

    @property
    def name(self) -> str:
        return "Explainshell & Man7 Ground Truth"

    @property
    def description(self) -> str:
        return "Ground-truth manpage synopsis and flag extractor for pipelines, subcommands, and operators via Explainshell and man7.org"

    def is_available(self) -> bool:
        return get_explainshell_db().is_available() or True

    def _resolve_single_command_explanation(self, cmd: str) -> Optional[CommandExplanation]:
        """Resolves manpage and flag breakdown for a single command or wrapper execution."""
        clean_cmd = cmd.strip()
        if not clean_cmd:
            return None

        db = get_explainshell_db()
        man7 = get_man7_engine()
        explanation: Optional[CommandExplanation] = None

        # 1. Try local Explainshell SQLite database
        try:
            if db.is_available():
                explanation = db.explain(clean_cmd)
        except Exception as e:
            logger.debug(f"Explainshell local lookup failed for '{clean_cmd}': {e}")

        # 2. If Explainshell missing or has no synopsis/flags, query official man7.org
        if not explanation or not explanation.synopsis or (not explanation.used_flags and "-" in clean_cmd):
            try:
                man7_explanation = man7.explain(clean_cmd)
                if man7_explanation and man7_explanation.synopsis:
                    if explanation:
                        # Merge flags if man7 found more
                        if len(man7_explanation.used_flags) > len(explanation.used_flags):
                            explanation.used_flags = man7_explanation.used_flags
                        if not explanation.synopsis:
                            explanation.synopsis = man7_explanation.synopsis
                        explanation.manpage_url = man7_explanation.manpage_url
                        if man7_explanation.nested_command and not explanation.nested_command:
                            explanation.nested_command = man7_explanation.nested_command
                    else:
                        explanation = man7_explanation
            except Exception as e:
                logger.debug(f"Man7 lookup failed for '{clean_cmd}': {e}")

        # 3. Attach official man7.org reference URL if not already populated
        if explanation and not explanation.manpage_url:
            try:
                man_data = man7.fetch_manpage(explanation.command)
                if man_data and man_data.get("url"):
                    explanation.manpage_url = man_data["url"]
            except Exception:
                pass

        # 4. Fallback if no manpage was found at all
        if not explanation:
            parts = clean_cmd.split()
            base_bin = parts[0] if parts else clean_cmd
            explanation = CommandExplanation(
                command=base_bin,
                manpage_source="system",
                synopsis=f"Execute system utility '{base_bin}'",
                used_flags=[],
                positional_args=parts[1:] if len(parts) > 1 else [],
            )

        return explanation

    async def process(self, context: PipelineContext) -> None:
        cmd = context.command.strip()
        if not cmd:
            return

        # 1. Decompose pipeline into stages and operators
        stage_tuples = PipelineCommandParser.split_pipeline_stages(cmd)
        if not stage_tuples:
            stage_tuples = [(cmd, None)]

        pipeline_stages: List[PipelineStage] = []
        pipeline_commands: List[CommandExplanation] = []
        pipeline_operators: List[PipelineOperatorInfo] = []

        for idx, (stage_cmd, op_str) in enumerate(stage_tuples):
            explanation = self._resolve_single_command_explanation(stage_cmd)
            if not explanation:
                continue

            op_info = PipelineCommandParser.get_operator_info(op_str) if op_str else None
            if op_info:
                pipeline_operators.append(op_info)

            stage = PipelineStage(
                stage_index=idx,
                raw_command=stage_cmd,
                command_explanation=explanation,
                trailing_operator=op_info,
            )
            pipeline_stages.append(stage)
            pipeline_commands.append(explanation)

        context.pipeline_stages = pipeline_stages
        context.pipeline_commands = pipeline_commands
        context.pipeline_operators = pipeline_operators

        # Set primary manpage explanation for backward compatibility
        if pipeline_stages:
            context.manpage_explanation = pipeline_stages[0].command_explanation

        # Multi-command Intent Summary generation
        if len(pipeline_stages) > 1 and not context.heuristic_intent:
            stage_summaries = []
            for stg in pipeline_stages:
                exp = stg.command_explanation
                syn = exp.synopsis or exp.command
                if exp.nested_command:
                    nested_syn = exp.nested_command.synopsis or exp.nested_command.command
                    stage_summaries.append(f"{exp.command} ({syn} ↳ invoking {exp.nested_command.command}: {nested_syn})")
                else:
                    stage_summaries.append(f"{exp.command} ({syn})")

            op_names = [stg.trailing_operator.name for stg in pipeline_stages if stg.trailing_operator]
            ops_text = f" via {', '.join(op_names)}" if op_names else ""
            context.heuristic_intent = f"Pipeline execution{ops_text}: " + " ➔ ".join(stage_summaries)

        elif len(pipeline_stages) == 1 and not context.heuristic_intent:
            exp = pipeline_stages[0].command_explanation
            if exp.synopsis:
                flag_summaries = []
                for f in exp.used_flags:
                    if f.summary:
                        flag_summaries.append(f"{f.flag} ({f.summary})")

                intent_str = f"Execute '{exp.command}': {exp.synopsis}."
                if exp.nested_command:
                    nested_syn = exp.nested_command.synopsis or exp.nested_command.command
                    intent_str += f" Invokes nested '{exp.nested_command.command}': {nested_syn}."
                if flag_summaries:
                    intent_str += " Flags: " + ", ".join(flag_summaries)
                context.heuristic_intent = intent_str

        context.tools_executed.append(self.name)
