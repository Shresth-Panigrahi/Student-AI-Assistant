#!/bin/bash

echo "🚀 Starting AI Student Assistant Web Application"
echo "================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python is not installed. Please install Python 3.10+ first."
    exit 1
fi

# Setup Backend
echo "🔧 Setting up Backend..."
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
if [ -f "requirements.txt" ]; then
    echo "📦 Installing backend dependencies..."
    pip install -q -r requirements.txt
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found in backend. Creating from example if available..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env from example. Please update with your API keys."
    else
        echo "❌ No .env.example found. Please create .env manually."
    fi
fi

# Check for GEMINI_API_KEY
if ! grep -q "GEMINI_API_KEY" .env; then
    echo "⚠️  GEMINI_API_KEY not found in backend/.env. AI features might not work."
fi

# Start Backend Server
echo "🚀 Starting FastAPI backend server..."
python3 main.py &
BACKEND_PID=$!
cd ..

# Wait for backend to initialize
echo "⏳ Waiting for backend to start..."
sleep 3

# Setup Frontend
echo "🎨 Setting up Frontend..."
cd webapp

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "📝 Creating frontend .env file..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
    else
        echo "VITE_API_URL=http://localhost:8000" > .env
    fi
fi

# Start Frontend
echo "🚀 Starting Vite frontend..."
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Application started successfully!"
echo "================================================"
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173 (or as shown above)"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for user interrupt
trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
