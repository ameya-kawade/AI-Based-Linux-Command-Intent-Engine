from app.core.analyzer import AnalyzerService
from app.core.executor import CommandExecutor
from app.core.explainshell_db import ExplainshellDB
from app.core.vector_db import CmdCaliperVectorStore
from app.services.history_manager import HistoryManager
from app.services.sandbox_client import SandboxClient

# Singletons across requests
analyzer_service = AnalyzerService()
command_executor = CommandExecutor()
history_manager = HistoryManager()
sandbox_client = SandboxClient()
explainshell_db = ExplainshellDB()
vector_store = CmdCaliperVectorStore()


def get_analyzer() -> AnalyzerService:
    return analyzer_service


def get_executor() -> CommandExecutor:
    return command_executor


def get_history_manager() -> HistoryManager:
    return history_manager


def get_sandbox_client() -> SandboxClient:
    return sandbox_client


def get_explainshell_db() -> ExplainshellDB:
    return explainshell_db


def get_vector_store() -> CmdCaliperVectorStore:
    return vector_store
