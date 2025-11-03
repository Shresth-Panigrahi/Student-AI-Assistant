# 🎓 AI Student Assistant - Web Application

> Real-time lecture transcription with AI-powered Q&A and intelligent analysis

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- 🎤 **Real-Time Transcription** - Live audio to text using Whisper AI
- 🤖 **AI Q&A Assistant** - Ask questions about the lecture
- 💾 **Session Management** - Save and organize lecture sessions
- 📊 **Smart Analysis** - AI summarization and terminology extraction
- 🎨 **Modern UI** - Vibrant interface with smooth animations
- 🗄️ **SQLite Database** - Persistent storage for all sessions

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- Microphone access

### Installation

**1. Install Dependencies**
```bash
# Frontend
cd webapp
npm install

# Backend
cd backend
pip install -r requirements.txt
pip install faster-whisper sounddevice soundfile
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
# Terminal 1 - Backend
cd backend
python3 main.py

# Terminal 2 - Frontend
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

1. Open http://localhost:3000
2. Click **"Start New Session"** (red card)
3. Click **"Start Recording"** (blue button)
4. **Allow microphone access** when prompted
5. **Speak into your microphone**
6. Watch real-time transcription appear
7. Click **"Stop Recording"** when done
8. Click **"Save"** to save to database

### Asking Questions

1. While recording, type questions in the AI Assistant panel
2. Click **"Ask"** or press Enter
3. Get AI-powered answers based on the transcript

### Viewing History

1. Click **"Session History"** on dashboard
2. Browse all saved sessions
3. Click any session to view details
4. Use **"Summarize"** or **"Extract Terminologies"** for analysis

## 📁 Project Structure

```
.
├── backend/                    # FastAPI Backend
│   ├── main.py                # Main API server
│   ├── audio_transcriber.py   # Whisper transcription
│   ├── database.py            # SQLite database
│   ├── ai_assistant.db        # Database file
│   └── requirements.txt       # Python dependencies
│
├── webapp/                     # React Frontend
│   ├── src/
│   │   ├── pages/             # Page components
│   │   ├── services/          # API & WebSocket
│   │   └── store/             # State management
│   ├── package.json
│   └── vite.config.ts
│
├── README.md                   # This file
├── requirements.txt            # Root Python dependencies
├── start_webapp.sh            # Linux/Mac startup
└── start_webapp.bat           # Windows startup
```

## 🛠️ Technology Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Framer Motion (animations)
- Zustand (state management)
- Axios (HTTP client)

### Backend
- FastAPI (web framework)
- faster-whisper (speech-to-text)
- SQLite3 (database)
- sounddevice (audio capture)
- WebSocket (real-time updates)

## 🎨 Features in Detail

### Real-Time Transcription
- Uses Whisper AI for accurate speech-to-text
- Processes audio in 3-second chunks
- Voice Activity Detection (VAD) for better accuracy
- Supports English language
- Local processing (private & secure)

### AI Q&A Assistant
- Context-aware question answering
- Uses transcript as knowledge base
- Real-time responses during lecture
- Chat history saved with session

### Session Management
- Save unlimited lecture sessions
- SQLite database for persistence
- View and search past sessions
- Export capabilities (future)

### Smart Analysis
- **Summarization**: AI-generated lecture summaries
- **Terminology Extraction**: Key terms with definitions
- **Subject Detection**: Automatic categorization

## 📊 API Endpoints

### Session Management
```
POST   /api/session/start       - Start recording
POST   /api/session/stop        - Stop recording
POST   /api/session/save        - Save session
GET    /api/sessions            - List all sessions
GET    /api/sessions/{id}       - Get specific session
```

### Transcription
```
GET    /api/transcription/poll  - Poll for new text
```

### Analysis
```
POST   /api/analyze/summarize       - Generate summary
POST   /api/analyze/terminologies   - Extract terms
```

### Q&A
```
POST   /api/qa/ask              - Ask question
```

### WebSocket
```
WS     /ws                      - Real-time updates
```

## 🔧 Configuration

### Whisper Model
Edit `backend/audio_transcriber.py`:
```python
# Change model size (tiny, base, small, medium, large)
model_size = "base"  # Default

# Change device (cpu, cuda)
device = "cpu"  # Default

# Change chunk duration (seconds)
CHUNK_DURATION = 3  # Default
```

### Polling Interval
Edit `webapp/src/pages/RecordingSession.tsx`:
```typescript
// Change polling frequency (milliseconds)
setInterval(async () => {
  // Poll for transcriptions
}, 1000)  // Default: 1 second
```

## 🐛 Troubleshooting

### Microphone Not Working
- Check browser permissions (allow microphone)
- Verify microphone in system settings
- Test: `python3 -c "import sounddevice as sd; print(sd.query_devices())"`

### Whisper Not Loading
```bash
pip install --upgrade faster-whisper
python3 -c "from faster_whisper import WhisperModel; print('OK')"
```

### No Transcription Appearing
- Check backend logs for "Transcribed:" messages
- Verify WebSocket connection in browser console
- Speak louder and clearer
- Wait 3-4 seconds for processing

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Kill process on port 8000
lsof -ti:8000 | xargs kill -9
```

## 📈 Performance

- **Latency**: 1-4 seconds (normal for real-time)
- **Accuracy**: Good for clear English speech
- **CPU Usage**: Moderate (Whisper processing)
- **Memory**: ~500MB with model loaded
- **Storage**: Minimal (SQLite database)

## 🔮 Future Enhancements

- [ ] User authentication
- [ ] Cloud storage integration
- [ ] Export to PDF/DOCX
- [ ] Multiple language support
- [ ] GPU acceleration
- [ ] Mobile app version
- [ ] Real-time collaboration
- [ ] Advanced search
- [ ] Quiz generation
- [ ] Note-taking integration

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- **OpenAI Whisper** - Speech recognition
- **FastAPI** - Web framework
- **React** - UI framework
- **Tailwind CSS** - Styling

## 📞 Support

For issues or questions:
1. Check this README
2. Review backend logs
3. Check browser console
4. Verify all dependencies installed

---

**Built with ❤️ for students and educators**

Version: 1.0.0 | Last Updated: November 2025
