import os
from dotenv import load_dotenv, find_dotenv
from pathlib import Path

# Load .env from backend root (one level up from app/)
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class ComponentConfig:
    # Database
    MONGODB_URL = os.getenv("MONGODB_URL", "mongodb+srv://shresthpanigrahi_db_user:oHMb7pnETsDx3890@cluster0.jvh7jlb.mongodb.net/?retryWrites=true&w=majority")
    DB_NAME = os.getenv("DB_NAME", "ai_student_assistant")
    
    # AI APIs
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyDO9XycvvgL9w9zpkaPTCiYY2iUAJTqJsc")
    ONDEMAND_API_KEY = os.getenv("ONDEMAND_API_KEY", "YEqFq6PiDJFHKUaJ3b0jtQURzYeW5NHj")
    TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "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")
    
    # Cloudinary
    CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "dvrx0az2r")
    CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "836786449962117")
    CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "a3IHeZDidO4onYDdBdGcYwtcQfo")

settings = ComponentConfig()
