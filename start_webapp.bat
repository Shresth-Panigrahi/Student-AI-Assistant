@echo off
echo Starting AI Student Assistant Web Application
echo ================================================

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Python is not installed. Please install Python 3.10+ first.
    pause
    exit /b 1
)

REM Install frontend dependencies if needed
if not exist "webapp\node_modules" (
    echo Installing frontend dependencies...
    cd webapp
    call npm install
    cd ..
)

REM Install backend dependencies
echo Checking Python dependencies...
pip install -q -r server\requirements.txt
pip install -q -r requirements.txt

REM Create .env file if it doesn't exist
if not exist "webapp\.env" (
    echo Creating .env file...
    copy webapp\.env.example webapp\.env
)

REM Start backend server
echo Starting Flask backend server...
start "Backend Server" cmd /k "cd server && python app.py"

REM Wait for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend development server
echo Starting React frontend...
cd webapp
start "Frontend Server" cmd /k "npm run dev"
cd ..

echo.
echo Application started successfully!
echo ================================================
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:5000
echo.
echo Close the server windows to stop the application
pause
