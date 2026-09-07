"""
Persistent SQLite history repository.

Stores analysis + execution history records in backend/data/history.sqlite using
WAL journal mode for concurrent read safety. Falls back gracefully on schema errors.
"""
import logging
import sqlite3
from pathlib import Path
from typing import List, Optional

from app.core.models import HistoryItem, IntentAnalysis

logger = logging.getLogger(__name__)

_DEFAULT_DB_PATH = Path(__file__).parent.parent.parent / "data" / "history.sqlite"

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS history (
    id          TEXT PRIMARY KEY,
    timestamp   TEXT NOT NULL,
    cwd         TEXT NOT NULL DEFAULT '',
    command     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'success',
    output      TEXT NOT NULL DEFAULT '',
    exit_code   INTEGER,
    duration_ms INTEGER,
    risk_level  TEXT,
    analysis_json TEXT
);
"""

_CREATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history (timestamp DESC);
"""


class HistoryRepository:
    """
    Thread-safe SQLite-backed history repository with WAL mode.
    """

    def __init__(self, db_path: Path = _DEFAULT_DB_PATH):
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self) -> None:
        try:
            with self._connect() as conn:
                conn.execute(_CREATE_TABLE_SQL)
                conn.execute(_CREATE_INDEX_SQL)
        except sqlite3.Error as exc:
            logger.error("Failed to initialize history SQLite DB at %s: %s", self.db_path, exc)

    @staticmethod
    def _row_to_item(row: sqlite3.Row) -> Optional[HistoryItem]:
        try:
            analysis: Optional[IntentAnalysis] = None
            if row["analysis_json"]:
                analysis = IntentAnalysis.model_validate_json(row["analysis_json"])
            return HistoryItem(
                id=row["id"],
                timestamp=row["timestamp"],
                cwd=row["cwd"],
                command=row["command"],
                status=row["status"],  # type: ignore[arg-type]
                output=row["output"],
                exit_code=row["exit_code"],
                duration_ms=row["duration_ms"],
                analysis=analysis,
            )
        except Exception as exc:
            logger.warning("Failed to deserialize history row: %s", exc)
            return None

    def save(self, item: HistoryItem) -> HistoryItem:
        """Upsert a HistoryItem."""
        analysis_json: Optional[str] = None
        if item.analysis:
            try:
                analysis_json = item.analysis.model_dump_json()
            except Exception as exc:
                logger.warning("Could not serialize analysis for %s: %s", item.id, exc)

        try:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO history
                        (id, timestamp, cwd, command, status, output, exit_code,
                         duration_ms, risk_level, analysis_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item.id,
                        item.timestamp,
                        item.cwd,
                        item.command,
                        item.status,
                        item.output or "",
                        item.exit_code,
                        item.duration_ms,
                        item.analysis.risk_level if item.analysis else None,
                        analysis_json,
                    ),
                )
        except sqlite3.Error as exc:
            logger.error("Failed to save history item %s: %s", item.id, exc)

        return item

    def get(self, item_id: str) -> Optional[HistoryItem]:
        try:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM history WHERE id = ?", (item_id,)
                ).fetchone()
                if row:
                    return self._row_to_item(row)
        except sqlite3.Error as exc:
            logger.error("Failed to fetch history item %s: %s", item_id, exc)
        return None

    def list(
        self,
        limit: int = 100,
        search: Optional[str] = None,
        risk: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[HistoryItem]:
        conditions: List[str] = []
        params: List[object] = []

        if search:
            conditions.append("command LIKE ?")
            params.append(f"%{search}%")
        if risk:
            conditions.append("risk_level = ?")
            params.append(risk.upper())
        if status:
            conditions.append("status = ?")
            params.append(status.lower())

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params.append(limit)

        try:
            with self._connect() as conn:
                rows = conn.execute(
                    f"SELECT * FROM history {where} ORDER BY timestamp DESC LIMIT ?",
                    params,
                ).fetchall()
                items = [self._row_to_item(r) for r in rows]
                return [i for i in items if i is not None]
        except sqlite3.Error as exc:
            logger.error("Failed to list history: %s", exc)
        return []

    def delete(self, item_id: str) -> bool:
        try:
            with self._connect() as conn:
                cursor = conn.execute("DELETE FROM history WHERE id = ?", (item_id,))
                return cursor.rowcount > 0
        except sqlite3.Error as exc:
            logger.error("Failed to delete history item %s: %s", item_id, exc)
        return False

    def clear(self) -> int:
        try:
            with self._connect() as conn:
                cursor = conn.execute("DELETE FROM history")
                return cursor.rowcount
        except sqlite3.Error as exc:
            logger.error("Failed to clear history: %s", exc)
        return 0

    def count(self) -> int:
        try:
            with self._connect() as conn:
                row = conn.execute("SELECT COUNT(*) FROM history").fetchone()
                return row[0] if row else 0
        except sqlite3.Error as exc:
            logger.error("Failed to count history: %s", exc)
        return 0
