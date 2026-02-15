from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from app.services.quiz_service import QuizService
from app.models.quiz import Quiz, QuizSubmissionRequest, QuizSubmissionResult
from app.database import db

router = APIRouter()

class GenerateQuizRequest(BaseModel):
    session_id: Optional[str] = None
    transcript_text: Optional[str] = None
    num_questions: int = 10
    difficulty: str = "medium"
    topic: Optional[str] = None

@router.post("/api/analyze/generate-quiz", response_model=Quiz)
async def generate_quiz(request: GenerateQuizRequest):
    """
    Generate a quiz from a session ID or direct transcript text.
    """
    transcript = request.transcript_text
    
    # If session_id provided, fetch transcript from DB
    if request.session_id and not transcript:
        if db.db is not None:
            session = await db.db.sessions.find_one({"id": request.session_id})
            if session:
                transcript = session.get("transcript", "")
    
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript text or valid Session ID required")
        
    try:
        quiz = await QuizService.generate_quiz(
            session_id=request.session_id or "manual",
            transcript_text=transcript,
            num_questions=request.num_questions,
            difficulty=request.difficulty,
            topic=request.topic
        )
        return quiz
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/quiz/{quiz_id}/submit", response_model=QuizSubmissionResult)
async def submit_quiz(quiz_id: str, request: QuizSubmissionRequest):
    """
    Submit answers for a quiz and get results.
    """
    try:
        result = await QuizService.submit_quiz(quiz_id, request.user_answers)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/quiz/{quiz_id}", response_model=Quiz)
async def get_quiz(quiz_id: str):
    """
    Get a specific quiz.
    """
    quiz = await QuizService.get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz
