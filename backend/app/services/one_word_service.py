from app.services.ai_service import AIService
from app.database import db
from app.models.one_word import OneWordQuestion, OneWordQuestionSet, CheckOneWordActionResult
import uuid

class OneWordService:
    @staticmethod
    async def generate_questions(session_id: str, transcript_text: str, num_questions: int = 20) -> OneWordQuestionSet:
        qs_id = str(uuid.uuid4())
        
        prompt = f"""
        Generate strict one-word answer questions based on the transcript.
        
        Parameters:
        - Number of questions: {num_questions}
        - Type: Fact-based recall
        
        Format Requirement:
        Return a JSON object with a "questions" array.
        Each question object MUST have:
        - "question_text": The question
        - "correct_answer": The primary one-word answer
        - "acceptable_answers": Array of strings (variations, e.g. ["USA", "America"])
        - "hint": A small clue
        - "category": [terminology, name, date, concept]
        
        TRANSCRIPT:
        {transcript_text[:15000]}
        """
        
        try:
            ai_data = await AIService.generate_json(prompt)
            q_data = ai_data.get("questions", [])
            
            parsed_qs = []
            for idx, q in enumerate(q_data):
                quest = OneWordQuestion(
                    question_id=f"ow_{idx}_{uuid.uuid4().hex[:4]}",
                    question_text=q["question_text"],
                    correct_answer=q["correct_answer"],
                    acceptable_answers=q.get("acceptable_answers", [q["correct_answer"]]),
                    hint=q.get("hint"),
                    category=q.get("category", "general")
                )
                parsed_qs.append(quest)
                
            qs = OneWordQuestionSet(
                question_set_id=qs_id,
                session_id=session_id,
                num_questions=len(parsed_qs),
                questions=parsed_qs
            )
            
            if db.db is not None:
                await db.db.one_word_question_sets.insert_one(qs.dict())
                
            return qs
        except Exception as e:
            print(f"❌ One Word Gen Failed: {e}")
            raise e

    @staticmethod
    async def check_answer(question_set_id: str, question_id: str, user_answer: str) -> CheckOneWordActionResult:
        if db.db is None: raise Exception("DB error")
        
        # Find the set first
        q_set_data = await db.db.one_word_question_sets.find_one({"question_set_id": question_set_id})
        if not q_set_data:
            raise ValueError("Question set not found")
            
        # Find question in the set
        # Using Pydantic model for cleaner access
        q_set = OneWordQuestionSet(**q_set_data)
        target_q = next((q for q in q_set.questions if q.question_id == question_id), None)
        
        if not target_q:
            raise ValueError("Question not found in set")
            
        # Check answer (case insensitive)
        is_correct = user_answer.strip().lower() in [a.lower() for a in target_q.acceptable_answers]
        
        return CheckOneWordActionResult(
            correct=is_correct,
            correct_answer=target_q.correct_answer
        )

    @staticmethod
    async def get_question_set(qs_id: str) -> OneWordQuestionSet:
        if db.db is None: return None
        data = await db.db.one_word_question_sets.find_one({"question_set_id": qs_id})
        return OneWordQuestionSet(**data) if data else None
