from fastapi import APIRouter, HTTPException
from app.services.one_word_service import OneWordService
from app.models.one_word import OneWordQuestionSet, GenerateOneWordRequest, CheckOneWordAnswerRequest, CheckOneWordActionResult
from app.database import db

router = APIRouter()

@router.post("/api/analyze/generate-one-word-questions", response_model=OneWordQuestionSet)
async def generate_one_word_questions(request: GenerateOneWordRequest):
    transcript = request.transcript_text
    
    if request.session_id and not transcript:
        if db.db is not None:
            session = await db.db.sessions.find_one({"id": request.session_id})
            if session:
                transcript = session.get("transcript", "")
    
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript required")
        
    try:
        return await OneWordService.generate_questions(
            session_id=request.session_id or "manual",
            transcript_text=transcript,
            num_questions=request.num_questions
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/one-word-questions/{question_set_id}/check-answer", response_model=CheckOneWordActionResult)
async def check_one_word_answer(question_set_id: str, request: CheckOneWordAnswerRequest):
    try:
        return await OneWordService.check_answer(question_set_id, request.question_id, request.user_answer)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/one-word-questions/{question_set_id}", response_model=OneWordQuestionSet)
async def get_one_word_questions(question_set_id: str):
    qs = await OneWordService.get_question_set(question_set_id)
    if not qs:
        raise HTTPException(status_code=404, detail="Set not found")
    return qs
