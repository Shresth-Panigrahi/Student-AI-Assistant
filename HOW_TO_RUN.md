# 🚀 How to Run AI Student Assistant

This guide will help you run the AI Student Assistant application on any laptop after cloning from Git.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

1. **Git** - For cloning the repository
   - Download: https://git-scm.com/downloads
   - Verify: `git --version`

2. **Node.js 18+** - For the frontend
   - Download: https://nodejs.org/ (LTS version recommended)
   - Verify: `node --version` and `npm --version`

3. **Python 3.10+** - For the backend
   - Download: https://www.python.org/downloads/
   - Verify: `python3 --version` or `python --version`

4. **Microphone** - For audio recording

## 🔽 Step 1: Clone the Repository

```bash
git clone <your-repository-url>
cd <repository-folder-name>
```

## 🔑 Step 2: Set Up API Keys

### Backend Configuration

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```

2. Create a `.env` file:
   ```bash
   # Linux/Mac
   touch .env
   
   # Windows
   type nul > .env
   ```

3. Add your Gemini API key to `.env`:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. Get a free Gemini API key:
   - Visit: https://makersuite.google.com/app/apikey
   - Sign in with Google account
   - Click "Create API Key"
   - Copy and paste into `.env` file

5. Return to root directory:
   ```bash
   cd ..
   ```

### Frontend Configuration (Optional)

The frontend will automatically connect to `http://localhost:8000`. If you need to change this:

1. Navigate to webapp folder:
   ```bash
   cd webapp
   ```

2. Create `.env` file:
   ```bash
   echo "VITE_API_URL=http://localhost:8000" > .env
   ```

3. Return to root:
   ```bash
   cd ..
   ```

## 📦 Step 3: Install Dependencies

### Option A: Automatic Installation (Recommended)

The startup scripts will automatically install dependencies when you run them.

### Option B: Manual Installation

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# OR
venv\Scripts\activate     # Windows

pip install -r requirements.txt
pip install faster-whisper sounddevice soundfile
cd ..
```

**Frontend:**
```bash
cd webapp
npm install
cd ..
```

## ▶️ Step 4: Run the Application

### Option A: Using Startup Scripts (Easiest)

**Linux/Mac:**
```bash
chmod +x start_webapp.sh
./start_webapp.sh
```

**Windows:**
```bash
start_webapp.bat
```

### Option B: Manual Start (Two Terminals)

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # Linux/Mac
# OR
venv\Scripts\activate     # Windows

python3 main.py
```

**Terminal 2 - Frontend:**
```bash
cd webapp
npm run dev
```

## 🌐 Step 5: Access the Application

Once both servers are running:

- **Frontend**: http://localhost:5173 (or http://localhost:3000)
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## ✅ Verify Installation

1. Open your browser to the frontend URL
2. You should see the landing page
3. Click "Start New Session"
4. Click "Start Recording" and allow microphone access
5. Speak into your microphone
6. You should see transcription appear in real-time

## 🐛 Common Issues & Solutions

### Issue: "Port already in use"

**Solution:**
```bash
# Linux/Mac - Kill process on port
lsof -ti:8000 | xargs kill -9  # Backend
lsof -ti:5173 | xargs kill -9  # Frontend

# Windows - Kill process on port
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Issue: "GEMINI_API_KEY not found"

**Solution:**
- Ensure you created `backend/.env` file
- Verify the API key is correct
- No spaces around the `=` sign
- No quotes around the key

### Issue: "Module not found" errors

**Solution:**
```bash
# Backend
cd backend
pip install -r requirements.txt --upgrade

# Frontend
cd webapp
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Microphone not working"

**Solution:**
- Check browser permissions (allow microphone)
- Verify microphone in system settings
- Try a different browser (Chrome recommended)
- Test microphone: `python3 -c "import sounddevice as sd; print(sd.query_devices())"`

### Issue: "No transcription appearing"

**Solution:**
- Speak louder and clearer
- Wait 3-4 seconds for processing
- Check backend terminal for errors
- Verify Whisper model downloaded (first run takes time)

### Issue: "Virtual environment activation fails"

**Solution:**
```bash
# Recreate virtual environment
cd backend
rm -rf venv
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

## 🔄 Updating the Application

To get the latest changes:

```bash
# Stop all running servers (Ctrl+C)

# Pull latest changes
git pull origin main

# Update backend dependencies
cd backend
source venv/bin/activate
pip install -r requirements.txt --upgrade
cd ..

# Update frontend dependencies
cd webapp
npm install
cd ..

# Restart the application
./start_webapp.sh  # or start_webapp.bat
```

## 🛑 Stopping the Application

**If using startup scripts:**
- Press `Ctrl+C` in the terminal

**If running manually:**
- Press `Ctrl+C` in both terminal windows

## 📊 System Requirements

**Minimum:**
- CPU: Dual-core processor
- RAM: 4GB
- Storage: 2GB free space
- OS: Windows 10+, macOS 10.15+, or Linux

**Recommended:**
- CPU: Quad-core processor
- RAM: 8GB
- Storage: 5GB free space
- Good quality microphone

## 🎯 Quick Start Checklist

- [ ] Git installed
- [ ] Node.js 18+ installed
- [ ] Python 3.10+ installed
- [ ] Repository cloned
- [ ] Gemini API key obtained
- [ ] `backend/.env` file created with API key
- [ ] Dependencies installed (automatic or manual)
- [ ] Application started
- [ ] Browser opened to frontend URL
- [ ] Microphone access granted
- [ ] Test recording successful

## 📞 Need Help?

1. Check the main [README.md](README.md) for detailed features
2. Review backend terminal logs for errors
3. Check browser console (F12) for frontend errors
4. Verify all prerequisites are installed correctly
5. Ensure API key is valid and has quota remaining

## 🎓 First Time Usage

1. **Start the application** using the steps above
2. **Allow microphone access** when prompted by browser
3. **Click "Start New Session"** on the dashboard
4. **Click "Start Recording"** (blue button)
5. **Speak clearly** into your microphone
6. **Watch transcription** appear in real-time
7. **Ask questions** using the AI Assistant panel
8. **Click "Stop Recording"** when done
9. **Click "Save"** to save the session
10. **View history** to see all saved sessions

---

**That's it! You're ready to use the AI Student Assistant! 🎉**

For more details about features and usage, see [README.md](README.md)
