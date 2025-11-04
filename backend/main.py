from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
from datetime import datetime
import asyncio
import uvicorn
import hashlib
import re

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
    think_mode: bool = False

class SaveSessionRequest(BaseModel):
    transcript: str
    chat: List[Dict[str, Any]]
    name: Optional[str] = None

class AnalyzeRequest(BaseModel):
    sessionId: str

class SignupRequest(BaseModel):
    name: str
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

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
    """Save the current session with refined transcript"""
    session_id = f"session_{int(datetime.now().timestamp())}"
    
    # Use provided name or generate default
    if request.name and request.name.strip():
        session_name = request.name.strip()
    else:
        stats = db.get_database_stats()
        session_name = f"Session {stats['sessions'] + 1}"
    
    # Refine the transcript before saving
    refined_transcript = request.transcript
    
    if is_ollama_available() and len(request.transcript.strip()) > 50:
        try:
            print(f"🔄 Refining transcript ({len(request.transcript)} chars)...")
            
            import requests
            
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

{request.transcript}

CLEANED TRANSCRIPT:"""
            
            response = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "llama3.2:1b",
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,
                        "top_p": 0.9,
                        "num_predict": 3000
                    }
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                refined_transcript = result.get("response", "").strip()
                
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
                print(f"📝 Original: {request.transcript[:100]}...")
                print(f"✨ Refined: {refined_transcript[:100]}...")
            else:
                print(f"⚠️ Refinement failed (status {response.status_code}), using original transcript")
                
        except Exception as e:
            print(f"❌ Refinement error: {e}, using original transcript")
    
    # Save to database with refined transcript
    success = db.create_session(
        session_id=session_id,
        name=session_name,
        transcript=refined_transcript,
        chat_messages=request.chat
    )
    
    if success:
        return {
            "success": True,
            "sessionId": session_id,
            "message": "Session saved with refined transcript",
            "refined": refined_transcript != request.transcript
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
    answer = chatbot.ask(request.question, transcript, request.think_mode)
    
    return {
        "success": True,
        "question": request.question,
        "answer": answer,
        "think_mode": request.think_mode,
        "transcript_length": len(transcript)
    }

@app.post("/api/analyze/summarize")
async def summarize_transcript(request: AnalyzeRequest):
    """Summarize a transcript using Ollama"""
    session = db.get_session_by_id(request.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    
    if not transcript or len(transcript.strip()) < 10:
        return {
            "success": False,
            "message": "Transcript too short to summarize"
        }
    
    # Check if Ollama is available
    if not is_ollama_available():
        return {
            "success": False,
            "message": "Ollama not available"
        }
    
    try:
        import requests
        
        # Create the prompt
        prompt = f"""You are an AI assistant integrated into a real-time lecture transcription system. Your job is to summarize spoken transcripts into clean, readable summaries.

The summary should retain all key concepts, definitions, and sequence of explanation from the transcript, while removing filler phrases and repetition.

Output should be clear, concise, and suitable for students reviewing lecture notes.

Here is a lecture transcript. Generate a structured summary that captures the main topics and their key points only from the lecture transcript.
Do not use external knowledge to generate summary, your task is to look at the transcript and generate the summary only.
CRITICAL FORMATTING RULES:
- DO NOT use markdown formatting (no **, ##, -, or *)
- DO NOT use asterisks or special characters for emphasis
- Use plain text only
- Structure with numbered sections and clear paragraphs
- Use line breaks to separate sections
- Write in complete sentences

CONTENT REQUIREMENTS:
- The tone is formal and educational
- Include clear topic headers (numbered: 1., 2., 3.)
- Add subpoints under each topic (use letters: a., b., c.)
- Do not omit definitions or examples mentioned in the transcript
- Keep summary length proportional to transcript size (around 20-25% of original)
- If the lecture is very short (under 50 words), provide a three-line summary

EXAMPLE FORMAT:
1. Main Topic Name
The main topic discusses... [explanation in plain text]

a. First subtopic
Description of first subtopic in plain text.

b. Second subtopic
Description of second subtopic in plain text.

2. Second Main Topic
The second topic covers... [explanation]

TRANSCRIPT:
{transcript}

Now generate the summary in plain text format without any markdown or special characters:"""
        
        print(f"🔄 Generating summary for transcript ({len(transcript)} chars)...")
        
        # Call Ollama
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3.2:1b",
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.5,
                    "max_tokens": 2000
                }
            },
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            summary = result.get("response", "").strip()
            
            print(f"✅ Summary generated: {len(summary)} chars")
            
            # Save to database
            db.update_session_summary(request.sessionId, summary)
            
            return {
                "success": True,
                "summary": summary,
                "metadata": {"mode": "summary"}
            }
        else:
            raise Exception(f"Ollama returned status {response.status_code}")
            
    except Exception as e:
        print(f"❌ Summarization error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"Failed to generate summary: {str(e)}"
        }

@app.post("/api/analyze/terminologies")
async def extract_terminologies(request: AnalyzeRequest):
    """Extract terminologies from a transcript using Ollama"""
    session = db.get_session_by_id(request.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    
    if not transcript or len(transcript.strip()) < 50:
        return {
            "success": False,
            "message": "Transcript too short to extract terminologies"
        }
    
    # Check if Ollama is available
    if not is_ollama_available():
        return {
            "success": False,
            "message": "Ollama not available"
        }
    
    try:
        import requests
        
        # Create the prompt
        prompt = f"""Extract key terms from this lecture transcript and return ONLY a JSON array.

RULES:
1. Extract any necessay (atleast 2-3) important technical terms, concepts, or acronyms
2. Each term needs a brief definition (1-2 sentences)
3. Return ONLY the JSON array, no other text
4. Use this EXACT format:

[
{{"term": "OSI Model", "definition": "A 7-layer framework for network communication"}},
{{"term": "Physical Layer", "definition": "The first layer handling physical transmission"}}
]

TRANSCRIPT:
{transcript}

JSON ARRAY:"""
        
        print(f"🔄 Extracting terminologies from transcript ({len(transcript)} chars)...")
        
        # Call Ollama
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3.2:1b",
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 1000
                }
            },
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            text = result.get("response", "").strip()
            
            print(f"📝 Raw response: {text[:200]}...")
            
            # Try to parse JSON
            try:
                import json
                import re
                
                # Fix incomplete JSON (add closing bracket if missing)
                if text.startswith('[') and not text.endswith(']'):
                    text = text + ']'
                
                # Extract JSON array from response
                json_match = re.search(r'\[.*\]', text, re.DOTALL)
                if json_match:
                    terms_list = json.loads(json_match.group())
                else:
                    # Fallback: try to parse the whole response
                    terms_list = json.loads(text)
                
                # Convert to the format expected by database
                terminologies = {}
                for idx, item in enumerate(terms_list):
                    term_name = item.get("term", f"term_{idx}")
                    term_key = term_name.lower().replace(" ", "_")
                    
                    terminologies[term_key] = {
                        "original_term": term_name,
                        "category": "concept",
                        "importance": "high",
                        "subject_area": "Lecture",
                        "definition": item.get("definition", ""),
                        "source": "ollama"
                    }
                
                print(f"✅ Extracted {len(terminologies)} terminologies")
                
                # Save to database
                db.add_terminologies(request.sessionId, terminologies)
                
                return {
                    "success": True,
                    "terminologies": terminologies,
                    "metadata": {"mode": "terminologies"}
                }
                
            except json.JSONDecodeError as e:
                print(f"❌ JSON parsing error: {e}")
                print(f"Response was: {text}")
                
                # Fallback: create basic terminologies
                terminologies = {
                    "extracted_content": {
                        "original_term": "Extracted Content",
                        "category": "general",
                        "importance": "medium",
                        "subject_area": "Lecture",
                        "definition": "Key terms could not be parsed. Please try again.",
                        "source": "fallback"
                    }
                }
                
                return {
                    "success": True,
                    "terminologies": terminologies,
                    "metadata": {"mode": "terminologies"}
                }
        else:
            raise Exception(f"Ollama returned status {response.status_code}")
            
    except Exception as e:
        print(f"❌ Terminology extraction error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"Failed to extract terminologies: {str(e)}"
        }

@app.post("/api/analyze/qa")
async def generate_qa(request: AnalyzeRequest):
    """Generate Q&A from transcript using Ollama"""
    session = db.get_session_by_id(request.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcript = session.get("transcript", "")
    
    if not transcript or len(transcript.strip()) < 50:
        return {
            "success": False,
            "message": "Transcript too short to generate Q&A"
        }
    
    # Check if Ollama is available
    if not is_ollama_available():
        return {
            "success": False,
            "message": "Ollama not available"
        }
    
    try:
        import requests
        import re
        
        if not is_ollama_available():
            return {"success": False, "message": "Ollama not available"}
        
        print(f"🔄 Generating Q&A using Ollama ({len(transcript)} chars)...")
        
        # Create simple, direct prompt
        prompt = f"""Read this lecture transcript and generate 5 quiz questions with answers.

Use this EXACT format:
Q1: [question]
A1: [answer]

Q2: [question]
A2: [answer]

TRANSCRIPT:
{transcript}

Generate 5 Q&A pairs now:"""
        
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3.2:1b",
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.4,
                    "num_predict": 1000
                }
            },
            timeout=90
        )
        
        if response.status_code != 200:
            return {"success": False, "message": f"Ollama error: {response.status_code}"}
        
        result = response.json()
        text = result.get("response", "").strip()
        
        print(f"📝 Ollama response: {text[:300]}...")
        
        # Parse Q&A pairs with regex
        qa_list = []
        lines = text.split('\n')
        current_q = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Match Q1:, Q2:, etc.
            q_match = re.match(r'^Q\d+[:\.]?\s*(.+)$', line, re.IGNORECASE)
            if q_match:
                current_q = q_match.group(1).strip()
                continue
            
            # Match A1:, A2:, etc.
            a_match = re.match(r'^A\d+[:\.]?\s*(.+)$', line, re.IGNORECASE)
            if a_match and current_q:
                current_a = a_match.group(1).strip()
                qa_list.append({"question": current_q, "answer": current_a})
                current_q = None
        
        print(f"✅ Parsed {len(qa_list)} Q&A pairs")
        
        if len(qa_list) > 0:
            print(f"📋 First Q&A: Q: {qa_list[0]['question'][:50]}... A: {qa_list[0]['answer'][:50]}...")
        
        if len(qa_list) < 2:
            print(f"❌ Not enough Q&A pairs generated")
            return {"success": False, "message": "Could not generate enough questions. Please try again."}
        
        print(f"✅ Returning {len(qa_list)} Q&A pairs")
        
        # Save Q&A to database
        db.add_qa_pairs(request.sessionId, qa_list)
        
        return {"success": True, "qa": qa_list}
            
    except Exception as e:
        print(f"❌ Q&A generation error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Failed: {str(e)}"}

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
async def signup(request: SignupRequest):
    """Register a new user"""
    # Validate password
    is_valid, error_msg = validate_password(request.password)
    if not is_valid:
        return {"success": False, "message": error_msg}
    
    # Check if username exists
    existing_user = db.get_user_by_username(request.username)
    if existing_user:
        return {"success": False, "message": "Username already exists"}
    
    # Check if email exists
    existing_email = db.get_user_by_email(request.email)
    if existing_email:
        return {"success": False, "message": "Email already registered"}
    
    # Hash password and create user
    password_hash = hash_password(request.password)
    success = db.create_user(request.name, request.username, request.email, password_hash)
    
    if success:
        return {
            "success": True,
            "message": "Account created successfully",
            "user": {
                "name": request.name,
                "username": request.username,
                "email": request.email
            }
        }
    else:
        return {"success": False, "message": "Failed to create account"}

@app.post("/api/auth/login")
async def login(request: LoginRequest):
    """Login user"""
    # Try to find user by username or email
    user = db.get_user_by_username(request.username_or_email)
    if not user:
        user = db.get_user_by_email(request.username_or_email)
    
    if not user:
        return {"success": False, "message": "User not found. Please sign up."}
    
    # Verify password
    password_hash = hash_password(request.password)
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
    print("🚀 Starting AI Student Assistant API on http://localhost:8000")
    print("📚 API Documentation: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
