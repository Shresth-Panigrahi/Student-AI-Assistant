from fastapi import APIRouter, HTTPException
from app.services.short_answer_service import ShortAnswerService
from app.models.short_answer import ShortAnswerQuestionSet, GenerateShortAnswerRequest, EvaluateAnswerRequest, AnswerEvaluationResult
from app.database import db

router = APIRouter()

@router.post("/api/analyze/generate-short-answer-questions", response_model=ShortAnswerQuestionSet)
async def generate_short_answer_questions(request: GenerateShortAnswerRequest):
    transcript = request.transcript_text
    
    if request.session_id and not transcript:
        if db.db is not None:
            session = await db.db.sessions.find_one({"id": request.session_id})
            if session:
                transcript = session.get("transcript", "")
    
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript required")
        
    try:
        return await ShortAnswerService.generate_questions(
            session_id=request.session_id or "manual",
            transcript_text=transcript,
            num_questions=request.num_questions
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/short-answer-questions/evaluate", response_model=AnswerEvaluationResult)
async def evaluate_short_answer(request: EvaluateAnswerRequest):
    try:
        return await ShortAnswerService.evaluate_answer(request.question_id, request.user_answer)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/short-answer-questions/{question_set_id}", response_model=ShortAnswerQuestionSet)
async def get_short_answer_set(question_set_id: str):
    if db.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
        
    data = await db.db.short_answer_question_sets.find_one({"question_set_id": question_set_id})
    if not data:
        raise HTTPException(status_code=404, detail="Set not found")
    return ShortAnswerQuestionSet(**data)
