"""
HistoryManager — dual-write history service.

Keeps an in-memory list for fast API responses AND persists to SQLite via
HistoryRepository so history survives server restarts.
"""
import logging
from datetime import datetime
from typing import List, Optional
import uuid

from app.core.models import HistoryItem, IntentAnalysis
from app.repositories.history_repository import HistoryRepository

logger = logging.getLogger(__name__)


class HistoryManager:
    """Manages command execution history with dual in-memory + SQLite persistence."""

    def __init__(self, max_items: int = 200):
        self.max_items = max_items
        self._history: List[HistoryItem] = []
        try:
            self._repo = HistoryRepository()
            # Bootstrap in-memory cache from persisted records on startup
            self._history = self._repo.list(limit=max_items)
            logger.info(
                "HistoryManager: loaded %d items from SQLite (%s)",
                len(self._history),
                self._repo.db_path,
            )
        except Exception as exc:
            logger.warning("HistoryManager: SQLite unavailable, using in-memory only: %s", exc)
            self._repo = None  # type: ignore[assignment]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _persist(self, item: HistoryItem) -> None:
        if self._repo is not None:
            try:
                self._repo.save(item)
            except Exception as exc:
                logger.warning("Failed to persist history item %s: %s", item.id, exc)

    # ------------------------------------------------------------------
    # Public API — unchanged interface for callers
    # ------------------------------------------------------------------

    def add_item(self, item: HistoryItem) -> HistoryItem:
        self._history.insert(0, item)
        if len(self._history) > self.max_items:
            self._history = self._history[: self.max_items]
        self._persist(item)
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
            status=status,  # type: ignore[arg-type]
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
        # Check in-memory cache first
        for item in self._history:
            if item.id == item_id:
                return item
        # Fall back to SQLite
        if self._repo is not None:
            return self._repo.get(item_id)
        return None

    def delete_by_id(self, item_id: str) -> bool:
        initial_len = len(self._history)
        self._history = [item for item in self._history if item.id != item_id]
        deleted_from_mem = len(self._history) < initial_len
        deleted_from_db = False
        if self._repo is not None:
            deleted_from_db = self._repo.delete(item_id)
        return deleted_from_mem or deleted_from_db

    def clear(self) -> None:
        self._history.clear()
        if self._repo is not None:
            self._repo.clear()
