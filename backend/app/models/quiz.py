from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class QuestionOption(BaseModel):
    option_id: str  # "A", "B", "C", "D"
    option_text: str

class QuizQuestion(BaseModel):
    question_id: str
    question_text: str
    options: List[QuestionOption]
    correct_answer: str  # Option ID
    explanation: str
    difficulty: str
    topic: str

class Quiz(BaseModel):
    quiz_id: str
    session_id: str
    num_questions: int
    difficulty: str
    questions: List[QuizQuestion]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict = {}

class QuizSubmissionRequest(BaseModel):
    user_answers: dict  # {question_id: selected_option_id}

class QuizSubmissionResult(BaseModel):
    submission_id: str
    quiz_id: str
    score: float
    total_questions: int
    correct_count: int
    results: List[dict]  # Detailed per-question result
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
