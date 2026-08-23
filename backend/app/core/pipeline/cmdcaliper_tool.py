"""
CmdCaliper Pipeline Tool.
Vector semantic similarity safety analysis using Ameya-Kawade/cmdcaliper.
"""

import logging
from typing import Optional

from app.core.models import CmdCaliperVerdict
from app.core.pipeline.base import BasePipelineTool, PipelineContext
from app.core.vector_db import CmdCaliperVectorStore

logger = logging.getLogger(__name__)


class CmdCaliperTool(BasePipelineTool):
    """
    Semantic Vector Similarity Safety Tool.
    Performs real-time cosine similarity search over curated attack patterns and benign commands.
    """

    def __init__(self, vector_store: Optional[CmdCaliperVectorStore] = None):
        self.vector_store = vector_store or CmdCaliperVectorStore()

    @property
    def name(self) -> str:
        return "CmdCaliper Semantic Vector Safety Engine"

    @property
    def description(self) -> str:
        return "Vector semantic similarity matching against known attack patterns and benign command corpus."

    def is_available(self) -> bool:
        return self.vector_store.is_available()

    async def process(self, context: PipelineContext) -> None:
        if not context.command.strip():
            return

        try:
            verdict: CmdCaliperVerdict = self.vector_store.search(context.command)
            context.cmdcaliper_verdict = verdict

            # If harmful or suspicious, inject warning callouts
            if verdict.verdict == "HARMFUL":
                warn_msg = f"[CmdCaliper Threat Match] {verdict.explanation}"
                if warn_msg not in context.warnings:
                    context.warnings.insert(0, warn_msg)
            elif verdict.verdict == "SUSPICIOUS":
                warn_msg = f"[CmdCaliper Anomaly] {verdict.explanation}"
                if warn_msg not in context.warnings:
                    context.warnings.append(warn_msg)

            context.tools_executed.append(self.name)

        except Exception as e:
            logger.error("Error executing CmdCaliperTool: %s", e, exc_info=True)
