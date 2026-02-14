from fastapi import APIRouter, HTTPException
from typing import List
from app.services.summary_service import SummaryService
from app.models.summary import Summary, GenerateSummaryRequest
from app.database import db

router = APIRouter()

# NOTE: The main summarize endpoint is now in analysis.py (/api/analyze/summarize)
# This router only handles retrieving previously generated summaries

@router.get("/api/summary/{summary_id}", response_model=Summary)
async def get_summary(summary_id: str):
    s = await SummaryService.get_summary(summary_id)
    if not s:
        raise HTTPException(status_code=404, detail="Summary not found")
    return s

@router.get("/api/session/{session_id}/summaries", response_model=List[Summary])
async def get_session_summaries(session_id: str):
    if db.db is None: return []
    cursor = db.db.summaries.find({"session_id": session_id}).sort("created_at", -1)
    summaries = await cursor.to_list(length=100)
    return [Summary(**s) for s in summaries]
