from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.models import HistoryItem
from app.dependencies import get_history_manager
from app.services.history_manager import HistoryManager

router = APIRouter(prefix="/api/history", tags=["Execution History"])


@router.get("", response_model=List[HistoryItem])
async def list_history(
    limit: int = Query(default=100, ge=1, le=500),
    search: Optional[str] = Query(default=None),
    risk: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    history_manager: HistoryManager = Depends(get_history_manager),
):
    """Returns execution history filtered by search term, risk level, or status."""
    return history_manager.get_all(
        limit=limit,
        search=search,
        risk_filter=risk,
        status_filter=status,
    )


@router.delete("")
async def clear_history(
    history_manager: HistoryManager = Depends(get_history_manager),
):
    """Clears all execution history entries."""
    history_manager.clear()
    return {"success": True, "message": "History cleared"}


@router.delete("/{item_id}")
async def delete_history_item(
    item_id: str,
    history_manager: HistoryManager = Depends(get_history_manager),
):
    """Deletes a specific history entry."""
    success = history_manager.delete_by_id(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"success": True, "deleted_id": item_id}
