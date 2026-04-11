# 🎓 Lecture Lyft — AI-Powered Lecture Companion
> Master technical documentation covering architecture, detailed workflow pipelines, AI model integration, and setup instructions.

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Python](https://img.shields.io/badge/python-3.10+-yellow)
![Node](https://img.shields.io/badge/node-18+-brightgreen)

## 📋 Table of Contents

- [System Overview](#system-overview)
- [✨ Core Features](#-core-features)
- [🧠 Detailed Workflow Pipelines](#-detailed-workflow-pipelines)
  - [1. Real-Time Transcription (Whisper)](#1-real-time-transcription-whisper)
  - [2. Topic-Aware Vocabulary Injection](#2-topic-aware-vocabulary-injection)
  - [3. AI Podcast Generation (Audio Overview)](#3-ai-podcast-generation-audio-overview)
  - [4. AI Q&A Assistant Mode (Think Mode)](#4-ai-qa-assistant-mode-think-mode)
  - [5. LangChain / LangGraph Analysis](#5-langchain--langgraph-analysis)
- [🗄️ Database Architecture](#️-database-architecture)
- [📁 Project Structure](#-project-structure)
- [💻 Technology Stack](#-technology-stack)
- [🚀 Setup & Installation Guide](#-setup--installation-guide)
- [API Reference](#api-reference)

---

## System Overview

Lecture Lyft is a robust client-server architecture combining a modern **React (Vite+TS)** frontend with a **FastAPI** backend to deliver real-time educational audio processing. The platform handles complex asynchronous streaming, offline/online AI synthesis, context-aware Q&A, and high-fidelity text-to-speech generation. 

At its core, the platform transitions raw audio into refined text, semantically dissects that text, and reformats it into study materials (summaries, flashcards, terminology lists, quizzes, and podcast overviews) using cloud-hosted LLMs and local ML models.

## ✨ Core Features

- 🎤 **Real-Time Streaming Transcription**: WebSocket-based chunk streaming from microphone to a locally running `faster-whisper` model.
- 🧠 **Context-Aware Processing**: Pre-computation of domain-specific keywords via Groq AI based on the user's initial topic to prime the speech-to-text pipeline.
- 🎙️ **AI Podcast Generation**: Automated pipeline converting lecture transcripts into a 2-host conversational dialogue synthesized asynchronously via **Kokoro TTS**.
- 🤖 **Real-Time Q&A Chatbot**: Contextual AI agent featuring **Think Mode**, allowing the system to either answer strictly from the transcript or merge external knowledge.
- 📝 **Smart Analytical Pipelines**: State-based generation of structured lecture summaries, terminologies, and quizzes using **LangGraph** & **LangChain**.
- 🗄️ **MongoDB Atlas Integration**: Migrated from SQLite to full cloud-based persistent NoSQL storage for scalability.
- 🎨 **State-of-the-Art UX/UI**: Immersive animations with GSAP, Framer Motion transitions, and a dynamic dashboard.

---

## 🧠 Detailed Workflow Pipelines

This section covers the technical pathways through which data enters the system and gets modified.

### 1. Real-Time Transcription (Whisper)

**Pipeline Path:** `Frontend (Recorder)` → `WebSocket` → `audio_transcriber_v2.py / audio_transcriber_v3.py` → `Frontend (Polling/WS)`

- The React client captures audio using the Web Audio API and `MediaRecorder` in chunks (typically 1-second intervals).
- These audio blobs are serialized and sent over a WebSocket connection to the FastAPI server.
- **VAD (Voice Activity Detection)** filters out silence to optimize compute.
- `faster-whisper` (CTranslate2 implementation) processes the chunk. We utilize rolling buffers to maintain context sentences, merging ongoing segments to prevent word-splitting at chunk boundaries.
- Transcripts are emitted back via WebSocket to provide a typewriter-like real-time UI feel.

### 2. Topic-Aware Vocabulary Injection

**Pipeline Path:** `Frontend (Session Start)` → `course_prompts.py` (Groq API) → `Whisper Initialization`

To combat industry-specific jargon hallucinations:
1. When a session starts, if a user provides a `session_title` (e.g., "Quantum Mechanics Spin States"), the backend triggers `course_prompts.py`.
2. A fast Groq model (`moonshotai/kimi-k2-instruct-0905`) generates ~20 domain-specific vocabulary words.
3. These words are injected directly into the `initial_prompt` keyword parameter of the Whisper model inference configuration.
4. **Result:** Whisper heavily biases towards predicting these tokens when the phonetics match, dramatically reducing transcription errors for technical lectures.

### 3. AI Podcast Generation (Audio Overview)

**Pipeline Path:** `audio_overview.py` → `Groq API (Scripting)` → `Kokoro TTS (Synthesis)` → `pydub (Export)`

This is a multi-modal post-processing step to turn a boring lecture into a dynamic podcast:
1. **Script Generation:** The refined transcript is fed into Groq to generate a two-host conversational script ("HOST_A" & "HOST_B") of approximately 1500 words.
2. **Parsing:** The resulting string is parsed via Regex into individual speaker turns.
3. **TTS Synthesis:** The `Kokoro TTS` model processes each turn iteratively. 
   - Uses `af_heart` voice for HOST_A and `am_adam` voice for HOST_B.
   - Synchronous timestamps (`startTime` and `endTime`) are calculated for every turn based on the generated sample counts at `24000 Hz`.
4. **Assembly:** NumPy arrays of audio frames are concatenated, appended with an array of silence between turns to add conversational realism.
5. **Encoding:** The arrays are bundled into a `.wav` file, and `pydub` recompresses it to a standard `.mp3`.
6. **Result:** An asynchronous `.mp3` file and a `.json` transcript are saved to the `/backend/ai/podcasts/` directory and served statically.

### 4. AI Q&A Assistant Mode (Think Mode)

**Pipeline Path:** `qa_chatbot.py` → `Vector Search (Coming Soon) / Context Window` → `Groq API`

While the lecture is happening:
- The user can open a side panel and ask questions.
- Under **Default Mode**, a highly restrictive System Prompt is injected into Groq instructing it to strictly source knowledge from the live transcribed text. If the answer isn't in the transcript, it reports a failure to find the answer.
- Under **Think Mode**, the constraint is lifted. The prompt provides the current transcript as context, but allows the LLM to pull from its pre-training domain knowledge to supplement, define, and expand on the context.

### 5. LangChain / LangGraph Analysis

**Pipeline Path:** `main.py endpoint` → `summarizer.py` / `terminology_extractor.py` / `qa_generator.py`

Once a lecture is finalized, users can run analysis operations. These use **LangGraph** workflows modeled as state machines:

```text
┌─────────────────────┐     ┌──────────────────────┐     
│   Summarizer Node   │     │ Terminologies Pipeline│    
│                     │     │  ┌──────────────┐    │     
│  ┌───────────────┐  │     │  │ Extract Node │───►│     
│  │ summarize_lec │──│─►   │  └──────┬───────┘    │     
│  └───────────────┘  │     │         │            │     
└─────────────────────┘     │  ┌──────▼───────┐    │     
                            │  │ Enrich Node  │───►│     
                            │  └──────────────┘    │     
                            └──────────────────────┘     
```

1. **Summarizer:** A single-step LangChain LLM call designed to output a strict JSON array of markdown-formatted summary blobs.
2. **Terminology Extraction:** A multi-node graph. Node 1 identifies complex nouns/concepts. Node 2 sequentially maps dictionary definitions and importance weights to those terms using the lecture's context.

---

## 🗄️ Database Architecture

The data layout operates using PyMongo connecting to MongoDB Atlas. Models are represented as Python type-hinted Pydantic-style dictionaries for insert.

### Key Collections:

- `users` — Handles authentication via hashed passwords (bcrypt).
- `sessions` — Represents a unique lecture recording.
  - Fields: `_id`, `user_id`, `title`, `transcript_blocks` (Array of objects holding timestamped text chunks), `created_at`, `duration`.
- `analysis` — Links `session_id` to its derivative generated data.
  - Fields: `summary_json`, `terminologies_map`, `quizzes_array`.
- `chat_history` — Stores arrays of User/Assisstant dialogue tied to a specific `session_id`.

---

## 📁 Project Structure

```text
.
├── backend/                       # Python FastAPI Application
│   ├── main.py                    # Root API Router & Websocket Hub
│   ├── audio_transcriber_v2.py    # Whisper VAD handling & rolling transcription
│   ├── audio_overview.py          # AI Podcast Kokoro TTS backend pipeline
│   ├── qa_chatbot.py              # Real-time QA router (Groq)
│   ├── course_prompts.py          # Whisper topic-injection LLM calls
│   ├── transcribe_enhanced.py     # Alternative complex whisper wrapper
│   ├── database_mongo.py          # PyMongo abstraction layer
│   ├── requirements.txt           # Environment configuration
│   └── ai/                        # Storage for generated podcasts and config
│
├── webapp/                        # React Frontend
│   ├── src/
│   │   ├── components/            # UI visual primitives
│   │   ├── pages/                 # Routing level React elements
│   │   ├── store/                 # Zustand state management setup
│   │   └── services/              # API and Socket integrations
│   ├── vite.config.ts             # Vitest & frontend build config
│   └── package.json               # Node deps
│
├── README.md                      # Detailed technical documentation
└── start_webapp.sh                # Main executable driver
```

---

## 💻 Technology Stack

### Frontend Application
- **Framework:** React 18 with TypeScript 
- **Tooling:** Vite for instantaneous HMR
- **Styling:** Tailwind CSS + custom CSS modules
- **Animations:** GSAP (ScrollTriggers) + Framer Motion (Page Transitions)
- **State Mgmt:** Zustand for low boilerplate cross-component reactivity
- **Networking:** Axios (REST HTTP) + native WebSockets (Streaming)

### Backend Services
- **Framework:** FastAPI (Uvicorn Async ASGI)
- **Database Engine:** MongoDB Atlas (PyMongo interaction)
- **AI Inferencing Pipeline:** Groq SDK (Model: `moonshotai/kimi-k2-instruct-0905`)
- **Speech-To-Text:** `faster-whisper` + `CTranslate2` backend, `sounddevice`
- **Text-To-Speech:** Kokoro TTS + `soundfile` + `pydub`
- **Generative Flows:** LangChain Framework, LangGraph State Machines

---

## 🚀 Setup & Installation Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ (LTS Version)
- **API Keys Required**: Groq API Key and MongoDB Connection URI.

### 1) Clone and Configure

```bash
git clone https://github.com/Shresth-Panigrahi/Student-AI-Assistant.git
cd Student-AI-Assistant
```

Navigate to `/backend` and create a `.env` file mapping your keys:
```env
GROQ_API_KEY=gsk_your_api_key_here
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority
```

### 2) Install Dependencies

**Backend Setup:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Frontend Setup:**
```bash
cd ../webapp
npm install
```

### 3) Start the Application Server

For an all-in-one launch sequence, use the appropriate bash/batch script in the root directory:

**Linux/macOS:**
```bash
chmod +x start_webapp.sh
./start_webapp.sh
```

**Windows:**
```cmd
start_webapp.bat
```

Alternatively, launch the servers individually in separate terminal instances:
- Backend: `cd backend && uvicorn main:app --reload --port 8000`
- Frontend: `cd webapp && npm run dev`

---

## 📊 Standard API Reference

### System
- `GET /api/health` — Checks database connection throughput.
- `WS /ws/transcribe` — Websocket connection for real-time PCM encoded byte audio streaming.

### Interactions
- `POST /api/session/start` — Initializes a database session and executes `course_prompts` if `title` provided.
- `POST /api/qa/ask` — Synchronous QA generation using the `Think Mode` flags.
- `POST /api/analyze/podcast` — Kicks off asynchronous Kokoro podcast task. Polling required.

### Data
- `GET /api/sessions/` — Retrieves chronological paginated sessions logic.
- `GET /api/audio/{filename}` — Serves static `.mp3` podcasts and JSON captions.

---

*Powered by advanced LangChain workflows, Local Whisper compute, and blazing fast Groq inference.*
