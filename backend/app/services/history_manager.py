from datetime import datetime
from typing import List, Optional
import uuid
from app.core.models import HistoryItem, IntentAnalysis


class HistoryManager:
    """Manages command execution history in memory and provides filtering & persistence."""

    def __init__(self, max_items: int = 200):
        self.max_items = max_items
        self._history: List[HistoryItem] = []

    def add_item(self, item: HistoryItem) -> HistoryItem:
        # Prepend to keep newest items first
        self._history.insert(0, item)
        if len(self._history) > self.max_items:
            self._history = self._history[: self.max_items]
        return item

    def create_item(
        self,
        command: str,
        cwd: str,
        analysis: Optional[IntentAnalysis] = None,
        status: str = "success",
        output: str = "",
        exit_code: Optional[int] = 0,
        duration_ms: Optional[int] = 0,
    ) -> HistoryItem:
        item = HistoryItem(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            cwd=cwd,
            command=command,
            analysis=analysis,
            status=status,  # type: ignore
            output=output,
            exit_code=exit_code,
            duration_ms=duration_ms,
        )
        return self.add_item(item)

    def get_all(
        self,
        limit: int = 100,
        search: Optional[str] = None,
        risk_filter: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> List[HistoryItem]:
        results = self._history
        if search:
            q = search.lower()
            results = [
                item for item in results
                if q in item.command.lower() or (item.analysis and q in item.analysis.intent.lower())
            ]
        if risk_filter:
            rf = risk_filter.upper()
            results = [
                item for item in results
                if item.analysis and item.analysis.risk_level == rf
            ]
        if status_filter:
            sf = status_filter.lower()
            results = [
                item for item in results
                if item.status.lower() == sf
            ]
        return results[:limit]

    def get_by_id(self, item_id: str) -> Optional[HistoryItem]:
        for item in self._history:
            if item.id == item_id:
                return item
        return None

    def delete_by_id(self, item_id: str) -> bool:
        initial_len = len(self._history)
        self._history = [item for item in self._history if item.id != item_id]
        return len(self._history) < initial_len

    def clear(self) -> None:
        self._history.clear()
