from app.services.ai_service import AIService
from app.database import db
from app.models.short_answer import ShortAnswerQuestion, ShortAnswerQuestionSet, AnswerEvaluationResult
import uuid

class ShortAnswerService:
    @staticmethod
    async def generate_questions(session_id: str, transcript_text: str, num_questions: int = 10) -> ShortAnswerQuestionSet:
        qs_id = str(uuid.uuid4())
        
        prompt = f"""
        Generate short-answer questions (requiring 2-5 sentences) based on the transcript.
        
        Parameters:
        - Number of questions: {num_questions}
        - Focus: Conceptual understanding
        
        Format Requirement:
        Return a JSON object with a "questions" array.
        Each question object MUST have:
        - "question_text": The question
        - "sample_answer": An ideal 2-5 sentence response
        - "key_points": Array of strings (main concepts that must be in the answer)
        - "difficulty": [easy, medium, hard]
        - "topic": Subject area
        
        TRANSCRIPT:
        {transcript_text[:15000]}
        """
        
        try:
            ai_data = await AIService.generate_json(prompt)
            data = ai_data.get("questions", [])
            
            parsed_questions = []
            for idx, q in enumerate(data):
                quest = ShortAnswerQuestion(
                    question_id=f"sa_{idx}_{uuid.uuid4().hex[:4]}",
                    question_text=q["question_text"],
                    sample_answer=q["sample_answer"],
                    key_points=q.get("key_points", []),
                    difficulty=q.get("difficulty", "medium"),
                    topic=q.get("topic", "general")
                )
                parsed_questions.append(quest)
                
            qs = ShortAnswerQuestionSet(
                question_set_id=qs_id,
                session_id=session_id,
                num_questions=len(parsed_questions),
                questions=parsed_questions
            )
            
            if db.db is not None:
                await db.db.short_answer_question_sets.insert_one(qs.dict())
                
            return qs
        except Exception as e:
            print(f"❌ Short Answer Gen Failed: {e}")
            raise e

    @staticmethod
    async def evaluate_answer(question_id: str, user_answer: str) -> AnswerEvaluationResult:
        if db.db is None: raise Exception("DB error")
        
        # We need to find the question. Since questions are embedded in sets, we search for the set containing the question.
        pipeline = [
            {"$match": {"questions.question_id": question_id}},
            {"$project": {
                "questions": {
                    "$filter": {
                        "input": "$questions",
                        "as": "q",
                        "cond": {"$eq": ["$$q.question_id", question_id]}
                    }
                }
            }}
        ]
        
        result = await db.db.short_answer_question_sets.aggregate(pipeline).to_list(length=1)
        
        if not result or not result[0].get("questions"):
            raise ValueError("Question not found")
            
        question_data = result[0]["questions"][0]
        # Map to model for easy access
        question = ShortAnswerQuestion(**question_data)
        
        # AI Evaluation
        prompt = f"""
        Evaluate the student's answer to the following question.
        
        Question: {question.question_text}
        
        Target Key Points: {', '.join(question.key_points)}
        Ideal Sample Answer: {question.sample_answer}
        
        Student Answer: {user_answer}
        
        Task:
        Score the answer from 0 to 100 based on accuracy and coverage of key points.
        Provide feedback explaining the score.
        List which key points were covered and which were missed.
        
        Format Requirement:
        Return JSON:
        {{
            "score": number,
            "feedback": "string",
            "key_points_covered": ["point 1", ...],
            "key_points_missed": ["point 2", ...]
        }}
        """
        
        try:
            eval_data = await AIService.generate_json(prompt)
            return AnswerEvaluationResult(
                score=eval_data.get("score", 0),
                feedback=eval_data.get("feedback", "No feedback provided"),
                key_points_covered=eval_data.get("key_points_covered", []),
                key_points_missed=eval_data.get("key_points_missed", [])
            )
        except Exception as e:
            print(f"❌ Evaluation Failed: {e}")
            raise e
