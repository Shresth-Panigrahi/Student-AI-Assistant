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

# Install dependencies from ROOT requirements.txt (contains all packages)
if [ -f "../requirements.txt" ]; then
    echo "📦 Installing dependencies from root requirements.txt..."
    pip install -q -r ../requirements.txt
else
    echo "⚠️  No requirements.txt found in project root!"
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

# Start Backend Server (use venv's Python directly for background process)
echo "🚀 Starting FastAPI backend server..."
./venv/bin/python main.py > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID $BACKEND_PID)"
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

# Ensure production build exists
if [ ! -d "dist" ]; then
    echo "🏗️  Building frontend for production..."
    npm run build
fi

# Start Frontend using Python Server (Robust Workaround)
echo "🚀 Starting Frontend Server..."
python3 simple_server.py > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started (PID $FRONTEND_PID)"

cd ..

echo ""
echo "✅ Application started successfully!"
echo "================================================"
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Logs available in backend.log and frontend.log"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for user interrupt
trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
