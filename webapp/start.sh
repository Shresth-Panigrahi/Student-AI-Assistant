#!/bin/bash

# ANSI colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting AI Student Assistant...${NC}"

# 1. Start Backend if not running
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${GREEN}Backend already running on port 8000${NC}"
else
    echo -e "${BLUE}Starting Backend...${NC}"
    cd "$(dirname "$0")/../backend"
    source venv/bin/activate
    python3 main.py > ../backend.log 2>&1 &
    BACKEND_PID=$!
    echo -e "${GREEN}Backend started (PID $BACKEND_PID)${NC}"
    cd - > /dev/null
fi

# 2. Start Frontend
echo -e "${BLUE}Starting Frontend Server...${NC}"
# Kill existing frontend if running
lsof -ti :3000 | xargs kill -9 2>/dev/null

python3 simple_server.py > server.log 2>&1 &
FRONTEND_PID=$!

echo -e "${GREEN}Frontend running at http://localhost:3000${NC}"
echo -e "${BLUE}Logs are being written to server.log and backend.log${NC}"

# 3. Open Browser
sleep 2
open http://localhost:3000

echo -e "${GREEN}Application launched successfully!${NC}"
