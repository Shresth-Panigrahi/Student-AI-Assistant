from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime

class Summary(BaseModel):
    summary_id: str
    session_id: str
    main_summary: str
    key_points: List[str]
    action_items: List[str]
    main_topics: List[str]
    summary_type: str  # brief, standard, detailed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict = {}

class GenerateSummaryRequest(BaseModel):
    session_id: Optional[str] = None
    transcript_text: Optional[str] = None
    summary_type: str = "standard"
    include_key_points: bool = True
    include_action_items: bool = True
