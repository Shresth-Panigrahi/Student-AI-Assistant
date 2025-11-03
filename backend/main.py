from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
from datetime import datetime
import asyncio
import uvicorn

# Import database module
import database as db

# Import audio transcriber
from audio_transcriber import get_transcriber, is_whisper_available

# Import Q&A chatbot
from qa_chatbot import get_chatbot, is_ollama_available

app = FastAPI(title="AI Student Assistant API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

class SaveSessionRequest(BaseModel):
    transcript: str
    chat: List[Dict[str, Any]]

class AnalyzeRequest(BaseModel):
    sessionId: str

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
print("✅ Using SQLite3 database")

# Routes
@app.get("/")
async def root():
    return {"message": "AI Student Assistant API", "status": "running"}

@app.get("/api/health")
async def health_check():
    stats = db.get_database_stats()
    return {
        "status": "healthy",
        "database": "sqlite3",
        "whisper_available": is_whisper_available(),
        "ollama_available": is_ollama_available(),
        "sessions_count": stats["sessions"],
        "messages_count": stats["messages"],
        "terminologies_count": stats["terminologies"],
        "is_recording": current_session["is_recording"],
        "transcript_length": len(current_session.get("transcript", ""))
    }

@app.post("/api/session/start")
async def start_session():
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
async def save_session(request: SaveSessionRequest):
    """Save the current session"""
    session_id = f"session_{int(datetime.now().timestamp())}"
    
    # Get current session count for naming
    stats = db.get_database_stats()
    session_name = f"Session {stats['sessions'] + 1}"
    
    # Save to database
    success = db.create_session(
        session_id=session_id,
        name=session_name,
        transcript=request.transcript,
        chat_messages=request.chat
    )
    
    if success:
        return {
            "success": True,
            "sessionId": session_id,
            "message": "Session saved to database successfully"
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

@app.post("/api/qa/ask")
async def ask_question(request: QuestionRequest):
    """Ask a question to the AI based on transcript context"""
    
    # Check if Ollama is available
    if not is_ollama_available():
        return {
            "success": False,
            "question": request.question,
            "answer": "Ollama is not available. Please start Ollama with: ollama serve"
        }
    
    # Get current transcript
    transcript = current_session.get("transcript", "")
    
    if not transcript or len(transcript.strip()) < 10:
        return {
            "success": False,
            "question": request.question,
            "answer": "Not enough transcript yet. Please wait for more transcription or start speaking."
        }
    
    # Get chatbot and ask question
    chatbot = get_chatbot()
    answer = chatbot.ask(request.question, transcript)
    
    return {
        "success": True,
        "question": request.question,
        "answer": answer,
        "transcript_length": len(transcript)
    }

@app.post("/api/analyze/summarize")
async def summarize_transcript(request: AnalyzeRequest):
    """Summarize a transcript"""
    session = db.get_session_by_id(request.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Simulate summarization (in real app, this would use LangGraph)
    summary = "This is a simulated summary. In the full version, this would use the EnhancedLectureTranscriptSummarizer with LangGraph to generate an intelligent summary of the lecture."
    
    # Save to database
    db.update_session_summary(request.sessionId, summary)
    
    return {
        "success": True,
        "summary": summary,
        "metadata": {"mode": "summary"}
    }

@app.post("/api/analyze/terminologies")
async def extract_terminologies(request: AnalyzeRequest):
    """Extract terminologies from a transcript"""
    session = db.get_session_by_id(request.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Simulate terminology extraction (in real app, this would use LangGraph)
    terminologies = {
        "machine_learning": {
            "original_term": "Machine Learning",
            "category": "concept",
            "importance": "high",
            "subject_area": "Computer Science",
            "definition": "A subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.",
            "source": "simulated"
        },
        "neural_network": {
            "original_term": "Neural Network",
            "category": "concept",
            "importance": "high",
            "subject_area": "Computer Science",
            "definition": "A computing system inspired by biological neural networks that learns to perform tasks by considering examples.",
            "source": "simulated"
        }
    }
    
    # Save to database
    db.add_terminologies(request.sessionId, terminologies)
    
    return {
        "success": True,
        "terminologies": terminologies,
        "metadata": {"mode": "terminologies"}
    }

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

if __name__ == "__main__":
    print("🚀 Starting AI Student Assistant API on http://localhost:8000")
    print("📚 API Documentation: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
