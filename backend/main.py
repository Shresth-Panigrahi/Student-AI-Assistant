from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
from datetime import datetime
import asyncio
import uvicorn
import hashlib
import re
import tempfile
from dotenv import load_dotenv
from groq import Groq
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi import Request

load_dotenv()
try:
    _groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
except:
    _groq_client = None

# Import database module (MongoDB)
import database_mongo as db

# Import audio transcriber
from transcribe_enhanced import transcribe_file
#from audio_transcriber import get_transcriber, is_whisper_available
from audio_transcriber_v2 import get_transcriber_v2 as get_transcriber
from audio_transcriber_v2 import is_whisper_available_v2 as is_whisper_available
#from audio_transcriber_v2 import transcribe_file  # disabled: using transcribe_enhanced
#changed to v3 (rolling correction)
""" from audio_transcriber_v3 import get_transcriber_v3 as get_transcriber
from audio_transcriber_v3 import is_whisper_available_v3 as is_whisper_available """

# Import Q&A chatbot
from qa_chatbot import get_chatbot, is_ollama_available

# Import LangChain/LangGraph analysis modules
from summarizer import summarize_transcript as lc_summarize
from terminology_extractor import extract_terminologies as lc_extract_terms
from qa_generator import generate_qa as lc_generate_qa
from flashcard_generator import generate_flashcards
from audio_overview import generate_audio_overview, check_podcast_exists, PODCASTS_DIR
from video_generator import start_video_generation, VIDEOS_DIR
from job_manager import get_job_status

app = FastAPI(title="Lecture Lyft API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Global state for current session only
current_session = {
    "transcript": "",
    "is_recording": False,
    "messages": []
}

# Queue for transcription results
transcription_queue = []

# Models
class QuestionRequest(BaseModel):
    question: str
    think_mode: bool = False

class SaveSessionRequest(BaseModel):
    transcript: str
    chat: List[Dict[str, Any]]
    name: Optional[str] = None

class AnalyzeRequest(BaseModel):
    sessionId: str

class ChatLectureReportRequest(BaseModel):
    session_id: str
    context_files: List[Dict[str, Any]] = []
    force_regenerate: bool = False

class ChatFlashcardsRequest(BaseModel):
    session_id: str
    context_files: List[Dict[str, Any]] = []
    count: int = 15
    force_regenerate: bool = False

class ChatQAAnalysisRequest(BaseModel):
    session_id: str
    context_files: List[Dict[str, Any]] = []
    count: int = 10
    force_regenerate: bool = False

class ChatAudioOverviewRequest(BaseModel):
    session_id: str
    context_files: List[Dict[str, Any]] = []

class VideoGenerateRequest(BaseModel):
    session_id: str

class SignupRequest(BaseModel):
    name: str
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

class StartSessionRequest(BaseModel):
    topic: Optional[str] = None

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"✅ Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"❌ Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error broadcasting: {e}")

manager = ConnectionManager()

# Database is initialized automatically when database module is imported
print("✅ Using MongoDB Atlas (Cloud)")

# Routes
@app.get("/")
async def root():
    return {"message": "Lecture Lyft API", "status": "running"}

@app.get("/api/health")
async def health_check():
    stats = db.get_database_stats()
    return {
        "status": "healthy",
        "database": "mongodb",
        "whisper_available": is_whisper_available(),
        "ollama_available": is_ollama_available(),
        "sessions_count": stats["sessions"],
        "messages_count": stats["messages"],
        "terminologies_count": stats["terminologies"],
        "is_recording": current_session["is_recording"],
        "transcript_length": len(current_session.get("transcript", ""))
    }

@app.post("/api/session/start")
@limiter.limit("5/minute")
async def start_session(request: Request, body: StartSessionRequest = StartSessionRequest()):
    """Start a new recording session with real Whisper transcription"""
    global transcription_queue
    
    # Set recording state but DON'T clear transcript/messages
    # This allows multiple recordings in the same session
    current_session["is_recording"] = True
    transcription_queue.clear()  # Clear only the pending queue
    
    # DON'T reset chatbot - keep conversation context
    # if is_ollama_available():
    #     chatbot = get_chatbot()
    #     chatbot.reset()
    
    # Check if Whisper is available
    if not is_whisper_available():
        await manager.broadcast({
            "type": "status",
            "status": "idle"
        })
        return {
            "success": False, 
            "message": "Whisper not available. Install with: pip install faster-whisper"
        }
    
    # Start real audio transcription
    transcriber = get_transcriber()
    
    # Set topic if provided (generates keywords via Gemini AI)
    if body.topic and body.topic.strip():
        transcriber.set_topic(body.topic.strip())
    else:
        transcriber.set_topic("")  # Reset to default
    
    # Track sent texts to prevent duplicates
    sent_texts = set()
    
    def sync_callback(text: str):
        """Callback for transcription results - runs in sync context"""
        text_lower = text.lower().strip()
        # Only add if not already sent (prevent duplicates at source)
        if text_lower not in sent_texts and text not in transcription_queue:
            sent_texts.add(text_lower)
            current_session["transcript"] += text + " "
            transcription_queue.append(text)
            print(f"✅ NEW transcription queued: {text}")
    
    success = transcriber.start_recording(sync_callback)
    
    if success:
        await manager.broadcast({
            "type": "status",
            "status": "recording"
        })
        return {"success": True, "message": "Recording started - Speak into your microphone"}
    else:
        return {"success": False, "message": "Failed to start recording"}

@app.get("/api/transcription/poll")
async def poll_transcription():
    """Poll for new transcription text"""
    global transcription_queue
    
    if transcription_queue:
        # Get all pending transcriptions and CLEAR immediately
        texts = list(set(transcription_queue))  # Remove duplicates
        transcription_queue.clear()
        
        # Broadcast via WebSocket
        for text in texts:
            await manager.broadcast({
                "type": "transcript",
                "text": text
            })
        
        return {"success": True, "texts": texts}
    
    return {"success": True, "texts": []}

@app.post("/api/session/stop")
async def stop_session():
    """Stop the current recording session"""
    current_session["is_recording"] = False
    
    # Stop transcriber
    if is_whisper_available():
        transcriber = get_transcriber()
        transcriber.stop_recording()
    
    await manager.broadcast({
        "type": "status",
        "status": "idle"
    })
    
    return {"success": True, "message": "Session stopped"}

@app.post("/api/session/clear")
async def clear_session():
    """Clear the current session data"""
    global transcription_queue
    
    current_session["transcript"] = ""
    current_session["messages"] = []
    current_session["is_recording"] = False
    transcription_queue.clear()
    
    # Reset chatbot
    if is_ollama_available():
        chatbot = get_chatbot()
        chatbot.reset()
    
    return {"success": True, "message": "Session cleared"}

@app.post("/api/session/save")
@limiter.limit("5/minute")
async def save_session(request: Request, body: SaveSessionRequest):
    """Save the current session with refined transcript"""
    session_id = f"session_{int(datetime.now().timestamp())}"
    
    # Use provided name or generate default
    if body.name and body.name.strip():
        session_name = body.name.strip()
    else:
        stats = db.get_database_stats()
        session_name = f"Session {stats['sessions'] + 1}"
    
    # Refine the transcript before saving
    refined_transcript = body.transcript
    
    if is_ollama_available() and len(body.transcript.strip()) > 50:
        try:
            print(f"🔄 Refining transcript ({len(body.transcript)} chars)...")
            
            prompt = f"""You are a professional transcript editor. Clean up this lecture transcript by removing ALL repetitions and errors.

STRICT RULES:
1. Remove ALL repeated words (even if separated by other words)
2. Remove ALL repeated sentences or phrases
3. Merge similar sentences into one clear sentence
4. Fix grammar and transcription errors
5. Keep the original meaning and educational content
6. Do NOT add new information
7. Do NOT add explanations or commentary
8. Output ONLY the cleaned transcript

EXAMPLES:

Input: "The OSI model is a 7 layer framework. The OSI model is a 7 layer framework that standardizes network communication."
Output: "The OSI model is a 7 layer framework that standardizes network communication."

Input: "It has seven layers. Seven layers in total. Each layer performs specific functions. Each layer performs specific functions like transmission."
Output: "It has seven layers in total. Each layer performs specific functions like transmission."

Input: "network network network network systems"
Output: "network systems"

Input: "The physical layer handles transmission. The data link layer handles transmission. The network layer handles transmission."
Output: "The physical layer, data link layer, and network layer each handle transmission."

Now clean this transcript. Remove ALL repetitions and merge similar content:

{body.transcript}

CLEANED TRANSCRIPT:"""
            
            if _groq_client:
                completion = _groq_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": "You are a professional transcript editor."},
                        {"role": "user", "content": prompt}
                    ],
                    model="moonshotai/kimi-k2-instruct-0905",
                    temperature=0.3
                )
                refined_transcript = completion.choices[0].message.content.strip()
            else:
                print("⚠️  Groq client not initialized - skipping refinement")
            
            # Remove common LLM prefixes
            prefixes_to_remove = [
                "Here is the cleaned transcript:",
                "Here's the cleaned transcript:",
                "Cleaned transcript:",
                "CLEANED TRANSCRIPT:",
                "The cleaned transcript is:",
            ]
            
            for prefix in prefixes_to_remove:
                if refined_transcript.startswith(prefix):
                    refined_transcript = refined_transcript[len(prefix):].strip()
                    break
            
            print(f"✅ Transcript refined: {len(refined_transcript)} chars")
            print(f"📝 Original: {body.transcript[:100]}...")
            print(f"✨ Refined: {refined_transcript[:100]}...")
                
        except Exception as e:
            print(f"❌ Refinement error: {e}, using original transcript")
    
    # Save to database with refined transcript
    success = db.create_session(
        session_id=session_id,
        name=session_name,
        transcript=refined_transcript,
        chat_messages=body.chat
    )
    
    if success:
        return {
            "success": True,
            "sessionId": session_id,
            "message": "Session saved with refined transcript",
            "refined": refined_transcript != body.transcript
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to save session")

@app.get("/api/sessions")
async def get_sessions():
    """Get all sessions from database"""
    sessions = db.get_all_sessions()
    return {"sessions": sessions}

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Get a specific session from database"""
    session = db.get_session_by_id(session_id)
    if session:
        return {"session": session}
    raise HTTPException(status_code=404, detail="Session not found")

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session from database"""
    success = db.delete_session(session_id)
    if success:
        return {"success": True, "message": "Session deleted successfully"}
    raise HTTPException(status_code=404, detail="Session not found")

@app.post("/api/qa/ask")
@limiter.limit("20/minute")
async def ask_question(request: Request, body: QuestionRequest):
    """Ask a question to the AI based on transcript context"""
    
    # Check if Ollama is available
    if not is_ollama_available():
        return {
            "success": False,
            "question": body.question,
            "answer": "Ollama is not available. Please start Ollama with: ollama serve"
        }
    
    # Get current transcript
    transcript = current_session.get("transcript", "")
    
    if not transcript or len(transcript.strip()) < 10:
        return {
            "success": False,
            "question": body.question,
            "answer": "Not enough transcript yet. Please wait for more transcription or start speaking."
        }
    
    # Get chatbot and ask question
    chatbot = get_chatbot()
    
    # Run synchronous Gemini call in a separate thread to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    answer = await loop.run_in_executor(None, chatbot.ask, body.question, transcript, body.think_mode)
    
    return {
        "success": True,
        "question": body.question,
        "answer": answer,
        "think_mode": body.think_mode,
        "transcript_length": len(transcript)
    }

@app.post("/api/analyze/summarize")
@limiter.limit("5/minute")
async def summarize_transcript(request: Request, body: AnalyzeRequest):
    """Summarize a transcript using LangChain + LangGraph"""
    session = db.get_session_by_id(body.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    
    if not transcript or len(transcript.strip()) < 10:
        return {"success": False, "message": "Transcript too short to summarize"}
    
    try:
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lc_summarize, transcript)
        
        if result["error"]:
            return {"success": False, "message": result["error"]}
        
        # Save to database
        db.update_session_summary(body.sessionId, result["summary"])
        
        return {
            "success": True,
            "summary": result["summary"],
            "metadata": {"mode": "summary", "engine": "langchain"}
        }
    except Exception as e:
        print(f"❌ Summarization error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Failed to generate summary: {str(e)}"}

@app.post("/api/analyze/terminologies")
@limiter.limit("5/minute")
async def extract_terminologies(request: Request, body: AnalyzeRequest):
    """Extract terminologies from a transcript using LangChain + LangGraph"""
    session = db.get_session_by_id(body.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    
    if not transcript or len(transcript.strip()) < 50:
        return {"success": False, "message": "Transcript too short to extract terminologies"}
    
    try:
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lc_extract_terms, transcript)
        
        if result["error"]:
            return {"success": False, "message": result["error"]}
        
        # Save to database
        db.add_terminologies(body.sessionId, result["terminologies"])
        
        return {
            "success": True,
            "terminologies": result["terminologies"],
            "metadata": {"mode": "terminologies", "engine": "langchain"}
        }
    except Exception as e:
        print(f"❌ Terminology extraction error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Failed to extract terminologies: {str(e)}"}

@app.post("/api/analyze/qa")
@limiter.limit("5/minute")
async def generate_qa(request: Request, body: AnalyzeRequest):
    """Generate Q&A from transcript using LangChain + LangGraph"""
    session = db.get_session_by_id(body.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    
    if not transcript or len(transcript.strip()) < 50:
        return {"success": False, "message": "Transcript too short to generate Q&A"}
    
    try:
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lc_generate_qa, transcript)
        
        if result["error"]:
            return {"success": False, "message": result["error"]}
        
        if len(result["qa_pairs"]) < 2:
            return {"success": False, "message": "Could not generate enough questions. Please try again."}
        
        # Save Q&A to database
        db.add_qa_pairs(body.sessionId, result["qa_pairs"])
        
        return {
            "success": True,
            "qa": result["qa_pairs"],
            "metadata": {"engine": "langchain"}
        }
    except Exception as e:
        print(f"❌ Q&A generation error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Failed: {str(e)}"}

# ============================================================
# Chat Feature Endpoints
# ============================================================

@app.post("/api/chat/lecture-report")
@limiter.limit("5/minute")
async def chat_lecture_report(request: Request, body: ChatLectureReportRequest):
    """Generate or return cached lecture report"""
    session = db.get_session_by_id(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    if not transcript or len(transcript.strip()) < 50:
        return {"success": False, "message": "Transcript too short to generate report"}
    
    # Return cached if available
    if session.get("summary") and not body.force_regenerate:
        return {"success": True, "report": session["summary"], "from_cache": True}
    
    # Build context from uploaded files
    context_text = ""
    if body.context_files:
        for cf in body.context_files:
            context_text += f"\n--- {cf.get('name', 'file')} ---\n{cf.get('content_base64', cf.get('content', ''))}\n"
    
    try:
        system_prompt = "You are an expert academic assistant. Generate a comprehensive lecture report strictly based on the provided transcript and any context files. Do not invent information not present in the sources."
        
        context_section = ""
        if context_text.strip():
            context_section = f"\nAlso incorporate insights from these additional context files:\n{context_text}"
        
        user_prompt = f"""Generate a detailed lecture report from the following transcript.{context_section}

Transcript:
{transcript}

Format the report in exactly these markdown sections with these exact headings:
## \U0001f4cb Overview
A 3-4 sentence high-level summary of what this lecture covers.

## \U0001f9e0 Key Concepts
List and explain the 4-8 most important concepts covered. For each: bold the concept name, then explain it in 2-3 sentences.

## \U0001f4cc Important Details
Bullet points of specific facts, formulas, definitions, or details that students must remember. Be precise and include exact values/formulas where present in the transcript.

## \U0001f517 Connections & Applications
How the concepts relate to each other and real-world applications mentioned.

## \U0001f3af Study Focus
What a student should prioritize studying from this lecture. List 3-5 specific things.

Be thorough but concise. Total length: 500-900 words. Use only information explicitly present in the transcript."""
        
        loop = asyncio.get_event_loop()
        
        def _generate():
            if not _groq_client:
                return None
            completion = _groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model="moonshotai/kimi-k2-instruct-0905",
                temperature=0.3
            )
            return completion.choices[0].message.content.strip()
        
        report = await loop.run_in_executor(None, _generate)
        
        if not report:
            return {"success": False, "message": "Failed to generate report. Groq client not available."}
        
        # Save to DB
        db.update_session_summary(body.session_id, report)
        
        return {"success": True, "report": report, "from_cache": False}
        
    except Exception as e:
        print(f"\u274c Lecture report error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Failed to generate report: {str(e)}"}


@app.post("/api/chat/flashcards")
@limiter.limit("5/minute")
async def chat_flashcards(request: Request, body: ChatFlashcardsRequest):
    """Generate or return cached flashcards"""
    session = db.get_session_by_id(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    if not transcript or len(transcript.strip()) < 50:
        return {"success": False, "message": "Transcript too short to generate flashcards"}
    
    # Return cached if available
    if session.get("flashcards") and not body.force_regenerate:
        return {"success": True, "flashcards": session["flashcards"], "count": len(session["flashcards"]), "from_cache": True}
    
    # Build context
    context_text = ""
    if body.context_files:
        for cf in body.context_files:
            context_text += f"\n--- {cf.get('name', 'file')} ---\n{cf.get('content_base64', cf.get('content', ''))}\n"
    
    try:
        loop = asyncio.get_event_loop()
        flashcards = await loop.run_in_executor(None, generate_flashcards, transcript, context_text, body.count)
        
        if not flashcards:
            return {"success": False, "message": "Failed to generate flashcards"}
        
        # Save to DB
        db.update_session_flashcards(body.session_id, flashcards)
        
        return {"success": True, "flashcards": flashcards, "count": len(flashcards), "from_cache": False}
        
    except Exception as e:
        print(f"\u274c Flashcard error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Failed to generate flashcards: {str(e)}"}


@app.post("/api/chat/qa-analysis")
@limiter.limit("5/minute")
async def chat_qa_analysis(request: Request, body: ChatQAAnalysisRequest):
    """Generate or return cached Q&A analysis"""
    session = db.get_session_by_id(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    if not transcript or len(transcript.strip()) < 50:
        return {"success": False, "message": "Transcript too short to generate Q&A"}
    
    # Return cached if available
    if session.get("qa_analysis") and not body.force_regenerate:
        return {"success": True, "questions": session["qa_analysis"], "from_cache": True}
    
    # Build context
    context_text = ""
    if body.context_files:
        for cf in body.context_files:
            context_text += f"\n--- {cf.get('name', 'file')} ---\n{cf.get('content_base64', cf.get('content', ''))}\n"
    
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lc_generate_qa, transcript, context_text, body.count)
        
        if result["error"]:
            return {"success": False, "message": result["error"]}
        
        questions = result["qa_pairs"]
        
        if len(questions) < 1:
            return {"success": False, "message": "Could not generate enough questions. Please try again."}
        
        # Save to DB
        db.update_session_qa_analysis(body.session_id, questions)
        
        return {"success": True, "questions": questions, "from_cache": False}
        
    except Exception as e:
        print(f"\u274c Q&A analysis error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Failed to generate Q&A: {str(e)}"}


@app.post("/api/chat/audio-overview")
@limiter.limit("2/minute")
async def chat_audio_overview(request: Request, body: ChatAudioOverviewRequest):
    """Generate audio overview podcast"""
    session = db.get_session_by_id(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    if not transcript or len(transcript.strip()) < 50:
        return {"success": False, "message": "Transcript too short to generate audio"}
    
    # Build context
    context_text = ""
    if body.context_files:
        for cf in body.context_files:
            context_text += f"\n--- {cf.get('name', 'file')} ---\n{cf.get('content_base64', cf.get('content', ''))}\n"
    
    try:
        result = await generate_audio_overview(
            session_id=body.session_id,
            transcript=transcript,
            session_title=session.get("name", "Lecture"),
            context_files_text=context_text
        )
        
        if result.get("error"):
            return {"success": False, "message": result["error"]}
        
        return {
            "success": True,
            "audio_url": result["audio_url"],
            "captions_url": result.get("captions_url"),
            "script": result["script"],
            "duration_seconds": result["duration_seconds"]
        }
        
    except Exception as e:
        print(f"\u274c Audio overview error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Failed to generate audio: {str(e)}"}


@app.get("/api/chat/audio-overview/{session_id}")
async def check_audio_overview(session_id: str):
    """Check if a podcast already exists for a session"""
    result = check_podcast_exists(session_id)
    return result


@app.get("/api/audio/{filename}")
async def stream_audio(filename: str):
    """Stream an audio file"""
    filepath = os.path.join(PODCASTS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    media_type = 'audio/mpeg' if filename.endswith('.mp3') else 'audio/wav'
    return FileResponse(filepath, media_type=media_type, filename=filename)

@app.post("/api/video/generate")
@limiter.limit("2/minute")
async def generate_video_api(request: Request, body: VideoGenerateRequest):
    """Start async video generation"""
    session = db.get_session_by_id(body.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    if not transcript or len(transcript) < 50:
        return {"success": False, "message": "Transcript too short."}
    
    job = get_job_status(body.session_id)
    if job and job["status"] not in ("complete", "failed", "none"):
        return {"success": True, "message": "Already generating", "status": job["status"]}
    
    start_video_generation(body.session_id, session.get("name", "Lecture"), transcript)
    return {"success": True, "message": "Started generation"}

@app.get("/api/video/status/{session_id}")
async def fetch_video_status(session_id: str):
    """Poll video job status"""
    # First check if the file physically exists on disk in case server restarted
    filepath = os.path.join(VIDEOS_DIR, f"{session_id}.mp4")
    if os.path.exists(filepath):
        return {
            "status": "complete",
            "progress": 100,
            "message": "Video recording complete",
            "video_url": f"/api/video/{session_id}.mp4",
            "error": None
        }

    job = get_job_status(session_id)
    if job:
        return {
            "status": job["status"],
            "progress": job.get("progress", 0),
            "message": job.get("message", ""),
            "video_url": job.get("video_url"),
            "error": job.get("message") if job["status"] == "failed" else None
        }
        
    return {"status": "none", "progress": 0, "message": "", "video_url": None, "error": None}

@app.get("/api/video/{filename}")
async def serve_video(filename: str):
    filepath = os.path.join(VIDEOS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Video file not found")
    return FileResponse(filepath, media_type="video/mp4", filename=filename)



# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages if needed
            print(f"Received: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Manual transcription endpoint (for testing or manual input)
@app.post("/api/transcribe/manual")
async def manual_transcribe(text: str):
    """Manually add transcription text (for testing)"""
    if current_session["is_recording"]:
        current_session["transcript"] += text + " "
        await manager.broadcast({
            "type": "transcript",
            "text": text
        })
        return {"success": True, "message": "Text added"}
    return {"success": False, "message": "Not recording"}


# File upload transcription endpoint
@app.post("/api/transcribe/upload")
@limiter.limit("5/minute")
async def upload_and_transcribe(request: Request, file: UploadFile = File(...)):
    """Upload an audio file and get the full transcript"""
    # Check if Whisper is available
    if not is_whisper_available():
        return {"success": False, "message": "Whisper not available. Install with: pip install faster-whisper"}

    # Validate file type
    allowed_extensions = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.wma'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        return {
            "success": False,
            "message": f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        }

    # Save uploaded file to temp location
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"upload_{int(datetime.now().timestamp())}_{file.filename}")

    try:
        # Write uploaded file to temp location
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)

        print(f"📂 Received file: {file.filename} ({len(content)} bytes)")

        # Run transcription in thread pool
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, transcribe_file, temp_path)

        if result.get("error"):
            return {"success": False, "message": result["error"]}

        # Store transcript in current session
        current_session["transcript"] = result["transcript"]

        return {
            "success": True,
            "transcript": result["transcript"],
            "duration": result.get("duration", 0),
            "language": result.get("language", "en"),
            "message": "File transcribed successfully"
        }

    except Exception as e:
        print(f"❌ Upload transcription error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Error processing file: {str(e)}"}

    finally:
        # Cleanup temp file
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
                pass

# Authentication endpoints
def hash_password(password: str) -> str:
    """Hash password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def validate_password(password: str) -> tuple[bool, str]:
    """Validate password requirements"""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not re.search(r'\d', password):
        return False, "Password must contain at least 1 digit"
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least 1 special character"
    return True, ""

@app.post("/api/auth/signup")
@limiter.limit("5/minute")
async def signup(request: Request, body: SignupRequest):
    """Register a new user"""
    # Validate password
    is_valid, error_msg = validate_password(body.password)
    if not is_valid:
        return {"success": False, "message": error_msg}
    
    # Check if username exists
    existing_user = db.get_user_by_username(body.username)
    if existing_user:
        return {"success": False, "message": "Username already exists"}
    
    # Check if email exists
    existing_email = db.get_user_by_email(body.email)
    if existing_email:
        return {"success": False, "message": "Email already registered"}
    
    # Hash password and create user
    password_hash = hash_password(body.password)
    success = db.create_user(body.name, body.username, body.email, password_hash)
    
    if success:
        return {
            "success": True,
            "message": "Account created successfully",
            "user": {
                "name": body.name,
                "username": body.username,
                "email": body.email
            }
        }
    else:
        return {"success": False, "message": "Failed to create account"}

@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    """Login user"""
    # Try to find user by username or email
    user = db.get_user_by_username(body.username_or_email)
    if not user:
        user = db.get_user_by_email(body.username_or_email)
    
    if not user:
        return {"success": False, "message": "User not found. Please sign up."}
    
    # Verify password
    password_hash = hash_password(body.password)
    if password_hash != user['password_hash']:
        return {"success": False, "message": "Wrong password"}
    
    return {
        "success": True,
        "message": "Login successful",
        "user": {
            "id": user['id'],
            "name": user['name'],
            "username": user['username'],
            "email": user['email']
        }
    }

if __name__ == "__main__":
    # Ensure background output dirs exist
    os.makedirs(PODCASTS_DIR, exist_ok=True)
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    print("🚀 Starting AI Student Assistant API on http://localhost:8000")
    print("📚 API Documentation: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
