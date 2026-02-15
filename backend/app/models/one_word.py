from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class OneWordQuestion(BaseModel):
    question_id: str
    question_text: str
    correct_answer: str
    acceptable_answers: List[str]
    hint: Optional[str] = None
    category: str

class OneWordQuestionSet(BaseModel):
    question_set_id: str
    session_id: str
    num_questions: int
    questions: List[OneWordQuestion]
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GenerateOneWordRequest(BaseModel):
    session_id: Optional[str] = None
    transcript_text: Optional[str] = None
    num_questions: int = 20

class CheckOneWordAnswerRequest(BaseModel):
    question_id: str
    user_answer: str

class CheckOneWordActionResult(BaseModel):
    correct: bool
    correct_answer: str
