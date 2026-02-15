from fastapi import APIRouter, HTTPException
from app.services.qa_chatbot import get_chatbot, is_ollama_available
from app.services.ai_service import AIService
from app.database import db
from app.state import current_session
from pydantic import BaseModel

router = APIRouter()

class QuestionRequest(BaseModel):
    question: str
    think_mode: bool = False

class AnalyzeRequest(BaseModel):
    sessionId: str

@router.post("/api/qa/ask")
async def ask_question(request: QuestionRequest):
    """Ask a question based on current session transcript"""
    if not is_ollama_available():
        return {"success": False, "answer": "AI Service not available."}
    
    transcript = current_session.get("transcript", "")
    if len(transcript.strip()) < 10:
        return {"success": False, "answer": "Not enough transcript yet."}
    
    chatbot = get_chatbot()
    # Call async ask method
    result = await chatbot.ask(request.question, transcript, request.think_mode)
    
    return {
        "success": True,
        "question": request.question,
        "answer": result.get("answer"),
        "sources": result.get("sources", []),
        "think_mode": request.think_mode
    }

@router.post("/api/analyze/terminologies")
async def extract_terminologies(request: AnalyzeRequest):
    if db.db is None: raise HTTPException(status_code=503)
    session = await db.db.sessions.find_one({"id": request.sessionId})
    if not session: raise HTTPException(status_code=404)
    
    transcript = session.get("transcript", "")
    
    prompt = f"""You are an expert academic analyzer. Extract ALL key technical terms, 
    concepts, and important vocabulary from this lecture transcript.
    
    For EACH term, provide a comprehensive analysis:
    
    Return a JSON array where each element has:
    - "term": The exact term or concept name
    - "definition": A clear, detailed definition (2-3 sentences explaining what it means)
    - "subject_area": The academic field this belongs to (e.g., "Computer Science", "Mathematics", "Physics", "Biology", "Chemistry", "History", "Economics", "Psychology", etc.)
    - "category": Type of term — one of: "concept", "theory", "method", "tool", "principle", "process", "model", "formula", "law", "technique"
    - "source": Where in the transcript this was mentioned — quote a short phrase from the transcript that relates to this term
    
    Extract at least 8-15 terms. Focus on:
    1. Technical terminology specific to the subject
    2. Key concepts and theories discussed
    3. Methods or techniques mentioned
    4. Important names, models, or frameworks
    5. Any formulas, laws, or principles referenced
    
    TRANSCRIPT:
    {transcript[:15000]}
    
    Return ONLY the JSON array, no other text."""
    
    try:
        data = await AIService.generate_json(prompt)
        terms_list = data if isinstance(data, list) else data.get("terms", data.get("terminologies", []))
        
        terminologies = {}
        for item in terms_list:
            term = item.get("term", "Unknown")
            key = term.lower().replace(" ", "_")
            terminologies[key] = {
                "original_term": term, 
                "definition": item.get("definition", ""),
                "subject_area": item.get("subject_area", "General"),
                "category": item.get("category", "concept"),
                "source": item.get("source", "Mentioned in transcript")
            }
            
        # Update DB
        await db.db.sessions.update_one(
            {"id": request.sessionId},
            {"$set": {"terminologies": terminologies}}
        )
        
        return {"success": True, "terminologies": terminologies}
    except Exception as e:
        print(f"❌ Terminologies extraction failed: {e}")
        return {"success": False, "message": str(e)}

@router.post("/api/analyze/qa")
async def generate_qa(request: AnalyzeRequest):
    """Generate Q&A pairs from transcript"""
    if db.db is None: raise HTTPException(status_code=503)
    session = await db.db.sessions.find_one({"id": request.sessionId})
    transcript = session.get("transcript", "") if session else ""
    
    if not transcript or len(transcript.strip()) < 10:
        return {"success": False, "message": "Not enough transcript content"}
    
    prompt = f"""You are an expert educator. Generate 10 high-quality Q&A pairs from this lecture transcript.
    
    Create a MIX of question types:
    - 3-4 FACTUAL questions (test recall of specific facts/definitions from the lecture)
    - 3-4 CONCEPTUAL questions (test understanding of ideas and relationships)
    - 2-3 ANALYTICAL questions (require combining multiple concepts or applying knowledge)
    
    Each question should:
    - Be clear and specific
    - Have a detailed, comprehensive answer (2-4 sentences)
    - Cover different parts of the transcript
    - Be useful for exam preparation
    
    Return a JSON array of objects with:
    - "question": The question text
    - "answer": The detailed answer
    
    TRANSCRIPT:
    {transcript[:15000]}
    
    Return ONLY the JSON array."""
    
    try:
        qa_list = await AIService.generate_json(prompt)
        # Handle if AI returns {questions: [...]} instead of [...]
        if isinstance(qa_list, dict):
            qa_list = qa_list.get("questions", qa_list.get("qa", []))
        
        await db.db.sessions.update_one(
            {"id": request.sessionId},
            {"$set": {"qa_pairs": qa_list}}
        )
        return {"success": True, "qa": qa_list}
    except Exception as e:
        print(f"❌ Q&A generation failed: {e}")
        return {"success": False, "message": str(e)}

@router.post("/api/analyze/summarize")
async def summarize_transcript(request: AnalyzeRequest):
    """Generate a detailed summary from transcript — returns plain string for frontend"""
    if db.db is None: raise HTTPException(status_code=503)
    session = await db.db.sessions.find_one({"id": request.sessionId})
    if not session: raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    if not transcript or len(transcript.strip()) < 10:
        return {"success": False, "message": "Not enough transcript content"}
    
    prompt = f"""You are an expert academic summarizer. Create a comprehensive, structured summary 
    of this lecture transcript.
    
    Format your summary as follows:
    1. Start with a brief overview paragraph (2-3 sentences)
    2. Then organize by MAIN TOPICS discussed (numbered: 1., 2., 3., etc.)
    3. Under each topic, provide sub-points with key details (using a), b), c) format)
    4. End with key takeaways
    
    Be thorough and detailed — this summary should help a student who missed the lecture 
    understand ALL the key content that was covered.
    
    TRANSCRIPT:
    {transcript[:20000]}
    
    Provide the summary as plain text (not JSON). Use numbers and letters for structure."""
    
    try:
        summary_text = await AIService.generate_content(prompt)
        
        # Save to session
        await db.db.sessions.update_one(
            {"id": request.sessionId},
            {"$set": {"summary": summary_text}}
        )
        
        return {"success": True, "summary": summary_text}
    except Exception as e:
        print(f"❌ Summary generation failed: {e}")
        return {"success": False, "message": str(e)}
