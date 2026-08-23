from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.core.models import CommandExplanation
from app.core.explainshell_db import ExplainshellDB
from app.core.man7_scraper import get_man7_engine
from app.dependencies import get_explainshell_db

router = APIRouter(prefix="/api/manpage", tags=["Ground-Truth Manpages (Explainshell & man7.org)"])


@router.get("/{command:path}", response_model=Optional[CommandExplanation])
async def get_manpage_info(
    command: str,
    db: ExplainshellDB = Depends(get_explainshell_db),
):
    """Retrieves ground-truth manpage synopsis and flag options from Explainshell and https://man7.org/linux/man-pages/."""
    cmd_clean = command.strip()
    if not cmd_clean:
        raise HTTPException(status_code=400, detail="Command name is required.")

    explanation = None
    if db.is_available():
        explanation = db.explain(cmd_clean)

    man7 = get_man7_engine()
    if not explanation or not explanation.synopsis or (not explanation.used_flags and "-" in cmd_clean):
        man7_exp = man7.explain(cmd_clean)
        if man7_exp:
            if explanation:
                if len(man7_exp.used_flags) > len(explanation.used_flags):
                    explanation.used_flags = man7_exp.used_flags
                if not explanation.synopsis:
                    explanation.synopsis = man7_exp.synopsis
                explanation.manpage_url = man7_exp.manpage_url
            else:
                explanation = man7_exp

    if explanation and not explanation.manpage_url:
        man_data = man7.fetch_manpage(explanation.command)
        if man_data and man_data.get("url"):
            explanation.manpage_url = man_data["url"]

    if not explanation:
        raise HTTPException(
            status_code=404,
            detail=f"Manpage for command '{cmd_clean}' not found in Explainshell or man7.org.",
        )

    return explanation
