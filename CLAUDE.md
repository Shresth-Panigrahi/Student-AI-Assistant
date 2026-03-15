# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Student Assistant (Lecture Lyft) - A real-time lecture transcription application with AI-powered Q&A, summarization, and terminology extraction. Uses Whisper for speech-to-text, Ollama for local LLM, and LangChain/LangGraph for analysis features.

## Common Commands

### Running the Application

**Option 1 - Windows batch file:**
```bash
cd Student-AI-Assistant
.\start_webapp.bat
```

**Option 2 - Manual (Two Terminals):**

Terminal 1 - Backend:
```bash
cd backend
venv\Scripts\activate
python .\main.py
```

Terminal 2 - Frontend:
```bash
cd webapp
npm run dev
```

### Access Points
- Frontend: http://localhost:5173 (or localhost:3000)
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

## Architecture

### Backend (FastAPI)
- **main.py** - FastAPI server with all endpoints, WebSocket manager, and rate limiting
- **audio_transcriber.py** - Whisper transcription engine with VAD
- **database_mongo.py** - MongoDB Atlas database operations
- **qa_chatbot.py** - Ollama-based Q&A chatbot
- **summarizer.py** - LangChain/LangGraph summarization
- **terminology_extractor.py** - LangChain terminology extraction
- **qa_generator.py** - LangChain Q&A pair generation

### Frontend (React + TypeScript)
- **pages/** - Dashboard, RecordingSession, History, TranscriptDetail, Auth, LandingPage
- **components/** - Reusable UI components with landing page sections
- **services/** - API client and WebSocket client
- **store/** - Zustand state management

### Database
- **MongoDB Atlas** (cloud) - stores sessions, chat messages, terminologies, users

## Environment Variables

### Backend (backend/.env)
```
GROQ_API_KEY=your_groq_api_key
MONGO_URI=your_mongodb_connection_string
```

### Frontend (webapp/.env)
```
VITE_API_URL=http://localhost:8000
```

## Key Dependencies

**Backend:** fastapi, uvicorn, faster-whisper, sounddevice, soundfile, groq, langchain, pymongo

**Frontend:** react, react-dom, react-router-dom, framer-motion, axios, zustand, lucide-react, date-fns, tailwindcss

## API Endpoints

- `POST /api/session/start` - Start recording with Whisper transcription
- `POST /api/session/stop` - Stop recording
- `POST /api/session/save` - Save session (with transcript refinement via Groq)
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/{id}` - Get specific session
- `DELETE /api/sessions/{id}` - Delete session
- `GET /api/transcription/poll` - Poll for new transcription
- `POST /api/qa/ask` - Ask question to AI (Ollama)
- `POST /api/analyze/summarize` - Generate summary (LangChain)
- `POST /api/analyze/terminologies` - Extract terminologies (LangChain)
- `POST /api/analyze/qa` - Generate Q&A pairs (LangChain)
- `WS /ws` - WebSocket for real-time updates

## Authentication

- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user