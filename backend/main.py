import uvicorn
from app.main import app

if __name__ == "__main__":
    print("🚀 Starting AI Student Assistant API (Refactored) on http://localhost:8000")
    print("📚 API Documentation: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
