# 🎓 Lecture Lyft — AI-Powered Lecture Companion

> Real-time lecture transcription with AI-powered Q&A, smart analysis, and quiz generation

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Python](https://img.shields.io/badge/python-3.10+-yellow)
![Node](https://img.shields.io/badge/node-18+-brightgreen)

## ✨ Features

- 🎤 **Real-Time Transcription** — Live audio-to-text using faster-whisper with Voice Activity Detection
- 🧠 **Topic-Aware Transcription** — Provide a lecture topic and Groq AI generates domain-specific keywords to boost Whisper accuracy
- 🤖 **AI Q&A Assistant** — Ask questions about the lecture in real-time with **Think Mode** (transcript-only or AI-augmented answers)
- 📝 **Smart Summarization** — LangChain + LangGraph pipeline generates structured lecture summaries
- 📚 **Terminology Extraction** — Two-stage pipeline (extract → enrich) to identify and define key terms
- ❓ **Quiz Generation** — Auto-generate short-answer and long-answer questions from transcripts
- ✨ **Transcript Refinement** — AI automatically cleans up repetitions and errors before saving
- 🔐 **User Authentication** — Sign up / login with password validation
- 🗄️ **MongoDB Atlas** — Cloud-hosted persistent storage for sessions, users, and analytics
- 🛡️ **Rate Limiting** — API rate limiting with SlowAPI to prevent abuse
- 🎨 **Modern Landing Page** — GSAP-animated hero, live demo section, and feature grid
- 🌊 **Smooth Animations** — Framer Motion transitions, splash screen, and navigation loader

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **MongoDB Atlas** account (or local MongoDB instance)
- **Groq API Key** ([console.groq.com](https://console.groq.com))
- Microphone access

### Environment Variables

Create a `.env` file in the `backend/` directory:

```env
GROQ_API_KEY=your_groq_api_key_here
MONGODB_URI=your_mongodb_connection_string
```

### Installation

**1. Install Dependencies**

```bash
# Frontend
cd webapp
npm install

# Backend
cd ../backend
pip install -r requirements.txt
```

**2. Start Application**

**Linux/Mac:**
```bash
chmod +x start_webapp.sh
./start_webapp.sh
```

**Windows:**
```bash
start_webapp.bat
```

**Or manually:**
```bash
# Terminal 1 — Backend
cd backend
python3 main.py

# Terminal 2 — Frontend
cd webapp
npm run dev
```

**3. Access Application**
```
Frontend: http://localhost:3000
Backend:  http://localhost:8000
API Docs: http://localhost:8000/docs
```

## 📖 Usage

### Recording a Lecture

1. Open http://localhost:3000 and sign up / log in
2. Click **"Start New Session"**
3. *(Optional)* Enter a **lecture topic** — AI will generate domain-specific keywords to boost transcription accuracy
4. Click **"Start Recording"** and allow microphone access
5. Speak into your microphone — watch real-time transcription appear
6. Click **"Stop Recording"** when done
7. Click **"Save"** — AI automatically refines the transcript before saving

### Asking Questions

1. While recording, type questions in the AI Assistant panel
2. **Default Mode** — answers strictly from the transcript only
3. **Think Mode** — AI uses its own knowledge alongside the transcript for deeper explanations

### Analyzing a Session

1. Click **"Session History"** on the dashboard
2. Select any saved session and use:
   - **📝 Summarize** — Structured lecture summary
   - **📚 Extract Terminologies** — Key terms with definitions, categories, and importance
   - **❓ Generate Quiz** — Short-answer and long-answer questions

## 📁 Project Structure

```
.
├── backend/                          # FastAPI Backend
│   ├── main.py                      # Main API server & routes
│   ├── audio_transcriber.py         # Whisper transcription (v1)
│   ├── audio_transcriber_v2.py      # Improved transcriber (active)
│   ├── audio_transcriber_v3.py      # Rolling correction variant
│   ├── course_prompts.py            # AI-powered keyword generation for topics
│   ├── qa_chatbot.py                # Real-time Q&A chatbot (Groq)
│   ├── summarizer.py                # LangChain/LangGraph summarization
│   ├── terminology_extractor.py     # LangChain/LangGraph terminology extraction
│   ├── qa_generator.py              # LangChain/LangGraph quiz generation
│   ├── database_mongo.py            # MongoDB Atlas database layer
│   ├── database.py                  # Legacy SQLite database layer
│   └── requirements.txt             # Python dependencies
│
├── webapp/                           # React Frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.tsx      # Marketing landing page
│   │   │   ├── Auth.tsx             # Login / Signup page
│   │   │   ├── Dashboard.tsx        # Main dashboard
│   │   │   ├── RecordingSession.tsx  # Live recording interface
│   │   │   ├── History.tsx          # Session history browser
│   │   │   └── TranscriptDetail.tsx # Session analysis view
│   │   ├── components/
│   │   │   ├── landing/             # Landing page components (Hero, Navbar, etc.)
│   │   │   ├── SplashScreen.tsx     # Animated splash screen
│   │   │   ├── InitialSplash.tsx    # Initial loading animation
│   │   │   ├── NavigationLoader.tsx # Page transition loader
│   │   │   └── ...                  # Reusable UI components
│   │   ├── services/
│   │   │   ├── api.ts               # Axios HTTP client
│   │   │   └── socket.ts            # WebSocket service
│   │   └── store/
│   │       └── useStore.ts          # Zustand state management
│   ├── package.json
│   └── vite.config.ts
│
├── migrate_to_mongo.py               # SQLite → MongoDB migration script
├── index.html                        # Static landing page
├── start_webapp.sh                   # Linux/Mac startup script
├── start_webapp.bat                  # Windows startup script
├── requirements.txt                  # Root Python dependencies
└── README.md                         # This file
```

## 🛠️ Technology Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool & dev server |
| Tailwind CSS | Utility-first styling |
| Framer Motion | Page transitions & animations |
| GSAP | Landing page scroll animations |
| React Lenis | Smooth scrolling |
| Zustand | Global state management |
| Axios | HTTP client |
| Lucide React | Icon library |
| React Router v6 | Client-side routing |

### Backend
| Technology | Purpose |
|---|---|
| FastAPI | Async web framework |
| faster-whisper | Local speech-to-text (Whisper) |
| Groq API (kimi-k2) | AI Q&A, transcript refinement, keyword generation |
| LangChain + LangGraph | Summarization, terminology extraction, quiz generation |
| MongoDB Atlas (PyMongo) | Cloud database |
| SlowAPI | Rate limiting |
| WebSocket | Real-time transcription streaming |

## 🧠 AI Architecture

### LangChain + LangGraph Pipelines

All analysis features use **LangGraph** state machines with **LangChain** prompt templates:

```
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   Summarizer Graph  │     │  Terminology Graph    │     │   Q&A Generator      │
│                     │     │                      │     │                      │
│  ┌───────────────┐  │     │  ┌──────────────┐    │     │  ┌────────────────┐  │
│  │   summarize   │──│─►   │  │ extract_terms │───►│     │  │   generate_qa  │──│─►
│  └───────────────┘  │     │  └──────┬───────┘    │     │  └────────────────┘  │
│                     │     │         │            │     │                      │
│                     │     │  ┌──────▼───────┐    │     │                      │
│                     │     │  │ enrich_terms  │───►│     │                      │
│                     │     │  └──────────────┘    │     │                      │
└─────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

### Topic-Aware Transcription

When a user provides a lecture topic:
1. **Groq AI** generates 15–20 domain-specific keywords
2. Keywords are injected as a Whisper **initial prompt** for vocabulary priming
3. **Hallucination leak patterns** are dynamically compiled to filter prompt echoes from output

### Think Mode (Q&A)

| Mode | Behavior |
|---|---|
| **Default** | Answers strictly from the transcript — no external knowledge |
| **Think Mode** | Uses AI knowledge + transcript for deeper explanations |

## 📊 API Endpoints

### Authentication
```
POST   /api/auth/signup          — Register a new user
POST   /api/auth/login           — Login with username/email + password
```

### Session Management
```
POST   /api/session/start        — Start recording (rate limited: 5/min)
POST   /api/session/stop         — Stop recording
POST   /api/session/clear        — Clear current session data
POST   /api/session/save         — Save session with AI-refined transcript (rate limited: 5/min)
GET    /api/sessions             — List all sessions
GET    /api/sessions/{id}        — Get specific session
DELETE /api/sessions/{id}        — Delete a session
```

### Transcription
```
GET    /api/transcription/poll   — Poll for new transcript text
POST   /api/transcribe/manual   — Manually add text (testing)
```

### AI Analysis (all rate limited: 5/min)
```
POST   /api/analyze/summarize       — Generate structured summary
POST   /api/analyze/terminologies   — Extract key terms with definitions
POST   /api/analyze/qa              — Generate quiz questions
```

### Q&A
```
POST   /api/qa/ask               — Ask a question (rate limited: 20/min)
```

### System
```
GET    /                         — API status
GET    /api/health               — Health check with DB stats
WS     /ws                       — Real-time WebSocket updates
```

## 🔧 Configuration

### Whisper Model

Edit `backend/audio_transcriber_v2.py`:
```python
# Change model size (tiny, base, small, medium, large)
model_size = "base"  # Default

# Change device (cpu, cuda)
device = "cpu"  # Default
```

### AI Model

The project uses the **Groq API** with `moonshotai/kimi-k2-instruct-0905`. To change the model, update references in:
- `backend/qa_chatbot.py`
- `backend/summarizer.py`
- `backend/terminology_extractor.py`
- `backend/qa_generator.py`
- `backend/course_prompts.py`

### Rate Limits

Configured via **SlowAPI** in `backend/main.py`:
- Session start/stop/save: 5 requests/minute
- Q&A: 20 requests/minute
- Analysis endpoints: 5 requests/minute

## 🐛 Troubleshooting

### Microphone Not Working
- Check browser permissions (allow microphone)
- Verify microphone in system settings
- Test: `python3 -c "import sounddevice as sd; print(sd.query_devices())"`

### Groq API Errors
- Verify `GROQ_API_KEY` is set in your `.env` file
- Check rate limits at [console.groq.com](https://console.groq.com)

### MongoDB Connection Issues
- Verify `MONGODB_URI` in your `.env` file
- Whitelist your IP in MongoDB Atlas Network Access
- Test: `python3 -c "from pymongo import MongoClient; print(MongoClient('your_uri').server_info())"`

### No Transcription Appearing
- Check backend logs for "Transcribed:" messages
- Verify WebSocket connection in browser console
- Speak louder and clearer
- Wait 3–4 seconds for processing

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Kill process on port 8000
lsof -ti:8000 | xargs kill -9
```

## 📈 Performance

| Metric | Value |
|---|---|
| Transcription latency | 1–4 seconds |
| Accuracy | Good for clear English speech |
| CPU usage | Moderate (Whisper processing) |
| Memory | ~500MB with model loaded |
| Storage | Cloud (MongoDB Atlas) |

## 🔮 Future Enhancements

- [ ] JWT-based token authentication
- [ ] Cloud storage integration
- [ ] Export to PDF/DOCX
- [ ] Multiple language support
- [ ] GPU acceleration
- [ ] Mobile app version
- [ ] Real-time collaboration
- [ ] Advanced search across sessions
- [ ] Note-taking integration

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License — See LICENSE file for details

## 🙏 Acknowledgments

- **[Groq](https://groq.com)** — Ultra-fast AI inference
- **[faster-whisper](https://github.com/SYSTRAN/faster-whisper)** — CTranslate2-based Whisper
- **[LangChain](https://langchain.com)** + **[LangGraph](https://langchain-ai.github.io/langgraph/)** — AI pipelines
- **[FastAPI](https://fastapi.tiangolo.com)** — High-performance Python web framework
- **[React](https://react.dev)** — UI framework
- **[MongoDB Atlas](https://www.mongodb.com/atlas)** — Cloud database

---

**Built with ❤️ for students and educators**

Version: 2.0.0 | Last Updated: March 2026
