# 🎓 AI Student Assistant - Web Application

> **Your Ultimate Lecture Companion**: Real-time transcription, intelligent Q&A, and automated study tools powered by **Gemini 2.5 Flash**.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active-success)

## ✨ Key Features

### 🎤 Real-Time Transcription
- **Live Audio to Text**: Accurate transcription using **Whisper** technology.
- **Microphone Support**: Works directly in your browser.
- **Session Recording**: Save transcripts for future reference.

### 🤖 AI Intelligence (Gemini 2.5 Flash)
- **Context-Aware Q&A**: Ask questions about the lecture while it's happening.
- **Think Mode**: Enhanced reasoning capabilities using **Tavily Search** integration for external fact-checking.
- **Smart Summaries**: Generate detailed, structured summaries with key points and action items.

### 📚 Advanced Study Tools
- **📇 AI Flashcards**: Automatically generate study decks from lecture content.
- **📝 Interactive Quizzes**:
    - **Multiple Choice**: Test your knowledge with auto-generated quizzes.
    - **One-Word Answer**: Rapid-fire fact retrieval practice.
    - **Short Answer**: Conceptual questions with AI grading and feedback.
- **📖 Terminology Extraction**: Identify key technical terms with definitions and sources.
- **🌐 Translation**: Bilingual support to translate transcripts and summaries instantly.

### 🛠️ Modern & Robust
- **MongoDB Database**: Scalable persistence for all your sessions and study materials.
- **Authentication**: Secure Login/Signup functionality (JWT-ready structure).
- **Responsive UI**: Built with React, TailwindCSS, and Framer Motion for a premium feel.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **Python 3.10+**
- **MongoDB** (Local or Atlas connection string)
- **Gemini API Key** (Google AI Studio)
- **Tavily API Key** (Optional, for "Think Mode")

### 1. Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Create a `.env` file in `/backend`:**
```env
# Database
MONGODB_URL=mongodb+srv://<your_connection_string>
DB_NAME=ai_student_assistant

# AI Services
GEMINI_API_KEY=your_gemini_api_key
TAVILY_API_KEY=your_tavily_api_key  # Optional

# Cloudinary (Optional, for media)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

**Run the Backend:**
```bash
python3 main.py
# Server starts at http://localhost:8000
```

### 2. Frontend Setup

```bash
cd webapp
npm install
```

**Run the Frontend:**
```bash
npm run dev
# App starts at http://localhost:3000 (or 5173)
```

---

## 📁 Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── routers/       # API Routes (Auth, Analysis, Quiz, etc.)
│   │   ├── services/      # Business Logic (AI, Transcription)
│   │   ├── models/        # Pydantic Data Models
│   │   └── main.py        # FastAPI Entry Point
│   └── requirements.txt
│
├── webapp/
│   ├── src/
│   │   ├── components/    # Reusable UI Components
│   │   ├── pages/         # Application Pages
│   │   ├── services/      # API Client
│   │   └── store/         # Zustand State Management
│   └── package.json
└── README.md
```

## 🛠️ Technology Stack

| Component | Tech |
|-----------|------|
| **Frontend** | React, TypeScript, Vite, TailwindCSS, Framer Motion, Zustand |
| **Backend** | FastAPI, Python 3.11+ |
| **Database** | MongoDB (Motor Async Driver) |
| **AI Model** | Google Gemini 2.5 Flash |
| **Transcription** | Faster-Whisper |
| **Search** | Tavily API |

## 🧪 Testing

The backend includes a comprehensive test suite for all features. Auto-generated docs can be accessed at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## 🔮 Future Roadmap

- [ ] PDF Export for Study Guides
- [ ] Collaborative Study Sessions
- [ ] Mobile Application (React Native)
- [ ] Voice Mode for Q&A

---

**Built for the "Student AI Assistant" Project**
