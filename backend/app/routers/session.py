from fastapi import APIRouter, HTTPException
from app.state import current_session, transcription_queue, manager
from app.services.audio_transcriber import get_transcriber, is_ondemand_available
from app.services.qa_chatbot import get_chatbot, is_ollama_available
from app.database import db
from app.services.ai_service import AIService
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio

router = APIRouter()

class SaveSessionRequest(BaseModel):
    transcript: str
    chat: List[Dict[str, Any]]
    name: Optional[str] = None

@router.post("/api/session/start")
async def start_session():
    """Start a new recording session with OnDemand transcription"""
    # Set recording state but DON'T clear transcript/messages
    current_session["is_recording"] = True
    transcription_queue.clear()
    
    # Check if OnDemand transcription is available
    if not is_ondemand_available():
        await manager.broadcast({"type": "status", "status": "idle"})
        return {"success": False, "message": "OnDemand transcription not configured."}
    
    transcriber = get_transcriber()
    sent_texts = set()
    
    def sync_callback(text: str):
        text_lower = text.lower().strip()
        if text_lower not in sent_texts and text not in transcription_queue:
            sent_texts.add(text_lower)
            current_session["transcript"] += text + " "
            transcription_queue.append(text)
            print(f"✅ NEW transcription queued: {text}")
    
    success = transcriber.start_recording(sync_callback)
    
    if success:
        await manager.broadcast({"type": "status", "status": "recording"})
        return {"success": True, "message": "Recording started"}
    else:
        return {"success": False, "message": "Failed to start recording"}

@router.post("/api/session/stop")
async def stop_session():
    """Stop the current recording session"""
    current_session["is_recording"] = False
    
    if is_ondemand_available():
        transcriber = get_transcriber()
        transcriber.stop_recording()
    
    await manager.broadcast({"type": "status", "status": "idle"})
    return {"success": True, "message": "Session stopped"}

@router.post("/api/session/clear")
async def clear_session():
    """Clear the current session data"""
    current_session["transcript"] = ""
    current_session["messages"] = []
    current_session["is_recording"] = False
    transcription_queue.clear()
    
    if is_ollama_available():
        chatbot = get_chatbot()
        chatbot.reset()
    
    return {"success": True, "message": "Session cleared"}

@router.get("/api/transcription/poll")
async def poll_transcription():
    """Poll for new transcription text"""
    if transcription_queue:
        texts = list(set(transcription_queue))
        transcription_queue.clear()
        
        for text in texts:
            await manager.broadcast({"type": "transcript", "text": text})
            
        return {"success": True, "texts": texts}
    return {"success": True, "texts": []}

@router.post("/api/session/save")
async def save_session(request: SaveSessionRequest):
    """Save the current session with refined transcript"""
    session_id = f"session_{int(datetime.now().timestamp())}"
    
    if request.name and request.name.strip():
        session_name = request.name.strip()
    else:
        # We need a way to get stats. 
        # For now, just generate a name based on date
        session_name = f"Session {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        if db.db is not None:
             count = await db.db.sessions.count_documents({})
             session_name = f"Session {count + 1}"

    refined_transcript = request.transcript
    
    # Refine transcript (Migrated logic)
    if is_ollama_available() and len(request.transcript.strip()) > 50:
        try:
            print(f"🔄 Refining transcript ({len(request.transcript)} chars)...")
            prompt = f"""You are a professional transcript editor. Clean up this lecture transcript.
            Remove repetitions, fix grammar, merge sentences. Keep original meaning.
            TRANSCRIPT: {request.transcript}"""
            
            refined_transcript = await AIService.generate_content(prompt)
            print("✅ Transcript refined")
        except Exception as e:
            print(f"❌ Refinement error: {e}")

    if db.db is None:
         raise HTTPException(status_code=503, detail="Database not connected")

    # Manual insert to match old structure (or use create_session if I migrate it)
    # The old `create_session` in `database.py` did insert_one.
    session_doc = {
        "id": session_id,
        "name": session_name,
        "timestamp": datetime.now(),
        "transcript": refined_transcript,
        "chat_messages": request.chat,
        "terminologies": {}, # Default empty
        "summary": ""
    }
    
    await db.db.sessions.insert_one(session_doc)
    
    return {
        "success": True, 
        "sessionId": session_id, 
        "message": "Session saved",
        "refined": refined_transcript != request.transcript
    }

@router.get("/api/sessions")
async def get_sessions():
    if db.db is None: return {"sessions": []}
    cursor = db.db.sessions.find().sort("timestamp", -1)
    sessions = await cursor.to_list(length=100)
    for s in sessions:
        if "_id" in s:
            s["_id"] = str(s["_id"])
    return {"sessions": sessions}

@router.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    if db.db is None: raise HTTPException(status_code=503, detail="DB Error")
    session = await db.db.sessions.find_one({"id": session_id})
    if session:
        if "_id" in session: session["_id"] = str(session["_id"])
        return {"session": session}
    raise HTTPException(status_code=404, detail="Session not found")

@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    if db.db is None: raise HTTPException(status_code=503, detail="DB Error")
    result = await db.db.sessions.delete_one({"id": session_id})
    if result.deleted_count:
        return {"success": True, "message": "Deleted"}
    raise HTTPException(status_code=404, detail="Not found")
