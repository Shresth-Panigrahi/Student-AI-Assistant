from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.database import db
from app.services.audio_transcriber import get_transcriber
from app.state import manager

# Import Routers
# Import Routers
from app.routers import (
    session, analysis, 
    quiz, flashcard, one_word, short_answer, summary, translation
)

app = FastAPI(title="AI Student Assistant API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(session.router)
app.include_router(analysis.router)
app.include_router(quiz.router)
app.include_router(flashcard.router)
app.include_router(one_word.router)
app.include_router(short_answer.router)
app.include_router(summary.router)
app.include_router(translation.router)

@app.on_event("startup")
async def startup_db_client():
    await db.connect_db()
    
    # Initialize transcriber (Lazy load to prevent startup hang)
    # transcriber = get_transcriber()
    # if transcriber.available:
    #     print("✅ OnDemand transcription ready")

@app.on_event("shutdown")
async def shutdown_db_client():
    await db.close_db()

@app.get("/")
async def root():
    return {"message": "AI Student Assistant API (Modular)", "status": "running"}

@app.get("/api/health")
async def health_check():
    # Basic health check
    return {
        "status": "healthy", 
        "database": "connected" if db.client else "disconnected"
    }

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages if needed
            # print(f"Received: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
