from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class Flashcard(BaseModel):
    card_id: str
    front: str
    back: str
    card_type: str  # definition, concept, formula, fact
    difficulty: str
    tags: List[str] = []

class FlashcardSet(BaseModel):
    flashcard_set_id: str
    session_id: str
    num_cards: int
    cards: List[Flashcard]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GenerateFlashcardsRequest(BaseModel):
    session_id: Optional[str] = None
    transcript_text: Optional[str] = None
    num_cards: int = 15
    card_types: Optional[List[str]] = None  # e.g. ["definition", "formula"]
