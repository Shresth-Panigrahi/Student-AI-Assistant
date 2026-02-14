from app.services.ai_service import AIService
from app.database import db
from app.models.quiz import Quiz, QuizQuestion, QuestionOption, QuizSubmissionResult
import uuid
from datetime import datetime

class QuizService:
    @staticmethod
    async def generate_quiz(session_id: str, transcript_text: str, num_questions: int = 10, difficulty: str = "medium", topic: str = None) -> Quiz:
        """
        Generate a quiz from transcript using AI
        """
        quiz_id = str(uuid.uuid4())
        
        prompt = f"""
        Generate a multiple-choice quiz based on the following transcript.
        
        Parameters:
        - Number of questions: {num_questions}
        - Difficulty: {difficulty}
        - Topic focus: {topic if topic else "General understanding of the lecture"}
        
        Format Requirement:
        Return a JSON object with a "questions" array.
        Each question object MUST have:
        - "question_text": The question string
        - "options": An array of 4 objects, each with "option_id" (A, B, C, D) and "option_text"
        - "correct_answer": The option_id of the correct answer (e.g., "A")
        - "explanation": Why it is correct
        - "topic": Sub-topic of the question
        
        TRANSCRIPT:
        {transcript_text[:15000]}  # Limit context window if needed
        """
        
        try:
            ai_data = await AIService.generate_json(prompt)
            questions_data = ai_data.get("questions", [])
            
            # Parse into Pydantic models
            parsed_questions = []
            for idx, q in enumerate(questions_data):
                options = [QuestionOption(**opt) for opt in q["options"]]
                question = QuizQuestion(
                    question_id=f"q_{idx}_{uuid.uuid4().hex[:4]}",
                    question_text=q["question_text"],
                    options=options,
                    correct_answer=q["correct_answer"],
                    explanation=q.get("explanation", ""),
                    difficulty=difficulty,
                    topic=q.get("topic", "General")
                )
                parsed_questions.append(question)
                
            quiz = Quiz(
                quiz_id=quiz_id,
                session_id=session_id,
                num_questions=len(parsed_questions),
                difficulty=difficulty,
                questions=parsed_questions,
                metadata={"generated_by": "gemini"}
            )
            
            # Save to DB
            if db.db is not None:
                await db.db.quizzes.insert_one(quiz.dict())
            
            return quiz
        except Exception as e:
            print(f"❌ Quiz Generation Failed: {e}")
            raise e

    @staticmethod
    async def submit_quiz(quiz_id: str, user_answers: dict) -> QuizSubmissionResult:
        """
        Evaluate quiz submission
        """
        if db.db is None:
            raise Exception("Database not connected")
            
        quiz_data = await db.db.quizzes.find_one({"quiz_id": quiz_id})
        if not quiz_data:
            raise ValueError("Quiz not found")
            
        quiz = Quiz(**quiz_data)
        correct_count = 0
        results = []
        
        for question in quiz.questions:
            user_ans = user_answers.get(question.question_id)
            is_correct = (user_ans == question.correct_answer)
            if is_correct:
                correct_count += 1
            
            results.append({
                "question_id": question.question_id,
                "user_answer": user_ans,
                "correct_answer": question.correct_answer,
                "is_correct": is_correct,
                "explanation": question.explanation
            })
            
        score = (correct_count / quiz.num_questions) * 100 if quiz.num_questions > 0 else 0
        
        submission_id = str(uuid.uuid4())
        submission = QuizSubmissionResult(
            submission_id=submission_id,
            quiz_id=quiz_id,
            score=score,
            total_questions=quiz.num_questions,
            correct_count=correct_count,
            results=results
        )
        
        # Save submission
        await db.db.quiz_submissions.insert_one(submission.dict())
        return submission

    @staticmethod
    async def get_quiz(quiz_id: str) -> Quiz:
        if db.db is None: return None
        data = await db.db.quizzes.find_one({"quiz_id": quiz_id})
        return Quiz(**data) if data else None
