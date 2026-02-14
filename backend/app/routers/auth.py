from fastapi import APIRouter, HTTPException
from app.models.auth import SignupRequest, LoginRequest
from app.database import db
from datetime import datetime
import hashlib
import re

router = APIRouter()

def hash_password(password: str) -> str:
    """Hash password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def validate_password(password: str) -> tuple[bool, str]:
    """Validate password requirements"""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not re.search(r'\d', password):
        return False, "Password must contain at least 1 digit"
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least 1 special character"
    return True, ""

@router.post("/api/auth/signup")
async def signup(request: SignupRequest):
    """Register a new user"""
    # Validate password
    is_valid, error_msg = validate_password(request.password)
    if not is_valid:
        return {"success": False, "message": error_msg}
    
    if db.db is None:
         raise HTTPException(status_code=503, detail="Database not connected")

    # Check if username exists
    existing_user = await db.db.users.find_one({"username": request.username})
    if existing_user:
        return {"success": False, "message": "Username already exists"}
    
    # Check if email exists
    existing_email = await db.db.users.find_one({"email": request.email})
    if existing_email:
        return {"success": False, "message": "Email already registered"}
    
    # Hash password and create user
    password_hash = hash_password(request.password)
    
    user_doc = {
        "name": request.name,
        "username": request.username,
        "email": request.email,
        "password_hash": password_hash,
        "created_at": datetime.utcnow()
    }
    await db.db.users.insert_one(user_doc)
    
    return {
        "success": True,
        "message": "Account created successfully",
        "user": {
            "name": request.name,
            "username": request.username,
            "email": request.email
        }
    }



@router.post("/api/auth/login")
async def login(request: LoginRequest):
    """Login user"""
    if db.db is None:
         raise HTTPException(status_code=503, detail="Database not connected")

    # Try to find user by username or email
    user = await db.db.users.find_one({"username": request.username_or_email})
    if not user:
        user = await db.db.users.find_one({"email": request.username_or_email})
    
    if not user:
        return {"success": False, "message": "User not found. Please sign up."}
    
    # Verify password
    password_hash = hash_password(request.password)
    if password_hash != user['password_hash']:
        return {"success": False, "message": "Wrong password"}
    
    return {
        "success": True,
        "message": "Login successful",
        "user": {
            "id": str(user['_id']),
            "name": user['name'],
            "username": user['username'],
            "email": user['email']
        }
    }
