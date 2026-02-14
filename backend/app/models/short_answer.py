from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime

class ShortAnswerQuestion(BaseModel):
    question_id: str
    question_text: str
    sample_answer: str
    key_points: List[str]
    difficulty: str
    topic: str

class ShortAnswerQuestionSet(BaseModel):
    question_set_id: str
    session_id: str
    num_questions: int
    questions: List[ShortAnswerQuestion]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GenerateShortAnswerRequest(BaseModel):
    session_id: Optional[str] = None
    transcript_text: Optional[str] = None
    num_questions: int = 10

class EvaluateAnswerRequest(BaseModel):
    question_id: str
    user_answer: str

class AnswerEvaluationResult(BaseModel):
    score: float  # 0-100
    feedback: str
    key_points_covered: List[str]
    key_points_missed: List[str]
