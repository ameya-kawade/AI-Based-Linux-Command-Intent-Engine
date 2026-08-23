import logging
from typing import Optional

from app.core.explainshell_db import get_explainshell_db
from app.core.man7_scraper import get_man7_engine
from app.core.pipeline.base import BasePipelineTool, PipelineContext

logger = logging.getLogger(__name__)


class ExplainshellTool(BasePipelineTool):
    """
    Pipeline tool extracting ground-truth manpage synopses and flag-level documentation
    from the explainshell SQLite database and official https://man7.org/linux/man-pages/.
    """

    @property
    def name(self) -> str:
        return "Explainshell & Man7 Ground Truth"

    @property
    def description(self) -> str:
        return "Ground-truth manpage synopsis and flag extractor via Explainshell and man7.org"

    def is_available(self) -> bool:
        return get_explainshell_db().is_available() or True

    async def process(self, context: PipelineContext) -> None:
        cmd = context.command.strip()
        if not cmd:
            return

        db = get_explainshell_db()
        man7 = get_man7_engine()
        explanation = None

        # 1. Try local Explainshell SQLite database
        try:
            if db.is_available():
                explanation = db.explain(cmd)
        except Exception as e:
            logger.debug(f"Explainshell local lookup failed for '{cmd}': {e}")

        # 2. If Explainshell missing or has no synopsis/flags, query official man7.org
        if not explanation or not explanation.synopsis or (not explanation.used_flags and "-" in cmd):
            try:
                man7_explanation = man7.explain(cmd)
                if man7_explanation and man7_explanation.synopsis:
                    if explanation:
                        # Merge flags if man7 found more
                        if len(man7_explanation.used_flags) > len(explanation.used_flags):
                            explanation.used_flags = man7_explanation.used_flags
                        if not explanation.synopsis:
                            explanation.synopsis = man7_explanation.synopsis
                        explanation.manpage_url = man7_explanation.manpage_url
                    else:
                        explanation = man7_explanation
            except Exception as e:
                logger.debug(f"Man7 lookup failed for '{cmd}': {e}")

        # 3. Attach official man7.org reference URL if not already populated
        if explanation and not explanation.manpage_url:
            try:
                man_data = man7.fetch_manpage(explanation.command)
                if man_data and man_data.get("url"):
                    explanation.manpage_url = man_data["url"]
            except Exception:
                pass

        context.manpage_explanation = explanation

        # If an explanation was found, refine default intent if still unset
        if explanation and explanation.synopsis and not context.heuristic_intent:
            flag_summaries = []
            for f in explanation.used_flags:
                if f.summary:
                    flag_summaries.append(f"{f.flag} ({f.summary})")

            intent_str = f"Execute '{explanation.command}': {explanation.synopsis}."
            if flag_summaries:
                intent_str += " Flags: " + ", ".join(flag_summaries)
            context.heuristic_intent = intent_str

        context.tools_executed.append(self.name)
