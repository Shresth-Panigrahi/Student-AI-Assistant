from fastapi import APIRouter, HTTPException
from app.services.flashcard_service import FlashcardService
from app.models.flashcard import FlashcardSet, GenerateFlashcardsRequest
from app.database import db

router = APIRouter()

@router.post("/api/analyze/generate-flashcards", response_model=FlashcardSet)
async def generate_flashcards(request: GenerateFlashcardsRequest):
    transcript = request.transcript_text
    
    if request.session_id and not transcript:
        if db.db is not None:
            session = await db.db.sessions.find_one({"id": request.session_id})
            if session:
                transcript = session.get("transcript", "")
    
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript required")
        
    try:
        updated_transcript = transcript  # Could add logic to limit size if needed
        fs = await FlashcardService.generate_flashcards(
            session_id=request.session_id or "manual",
            transcript_text=updated_transcript,
            num_cards=request.num_cards,
            card_types=request.card_types
        )
        return fs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/flashcards/{flashcard_set_id}", response_model=FlashcardSet)
async def get_flashcard_set(flashcard_set_id: str):
    fs = await FlashcardService.get_flashcard_set(flashcard_set_id)
    if not fs:
        raise HTTPException(status_code=404, detail="Flashcard set not found")
    return fs
