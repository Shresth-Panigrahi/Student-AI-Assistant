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

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "⚠️  Ollama is not running. Starting Ollama..."
    ollama serve &
    sleep 3
fi

# Install frontend dependencies if needed
if [ ! -d "webapp/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd webapp
    npm install
    cd ..
fi

# Install backend dependencies if needed
echo "📦 Checking Python dependencies..."
pip install -q -r server/requirements.txt
pip install -q -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f "webapp/.env" ]; then
    echo "📝 Creating .env file..."
    cp webapp/.env.example webapp/.env
fi

# Start backend server in background
echo "🔧 Starting Flask backend server..."
cd server
python3 app.py &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend development server
echo "🎨 Starting React frontend..."
cd webapp
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Application started successfully!"
echo "================================================"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for user interrupt
trap "echo ''; echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
