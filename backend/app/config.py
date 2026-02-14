import os
from dotenv import load_dotenv, find_dotenv
from pathlib import Path

# Load .env from backend root (one level up from app/)
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class ComponentConfig:
    MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    DB_NAME = os.getenv("DB_NAME", "ai_student_assistant")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    ONDEMAND_API_KEY = os.getenv("ONDEMAND_API_KEY")
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY") # Added Tavily key
    
    # Cloudinary
    CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
    CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
    CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

settings = ComponentConfig()
