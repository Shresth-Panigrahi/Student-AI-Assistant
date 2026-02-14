import os
import asyncio
from datetime import datetime
from typing import List, Dict, Optional, Any
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "ai_student_assistant")

client = None
db = None

async def init_database():
    """Initialize MongoDB connection"""
    global client, db
    try:
        client = AsyncIOMotorClient(MONGODB_URL)
        db = client[DB_NAME]
        
        # Create indexes
        await db.sessions.create_index("timestamp", unique=False)
        await db.sessions.create_index("id", unique=True)
        await db.users.create_index("username", unique=True)
        await db.users.create_index("email", unique=True)
        
        print(f"✅ Connected to MongoDB: {DB_NAME}")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        raise e

def get_databasestats_async():
    """Get database statistics (wrapper for async call)"""
    # This is a bit tricky since stats are usually awaited.
    # main.py expects a sync return or we need to await it there.
    # We will return 0 and let health check handle async stats if updated.
    return {"sessions": 0, "messages": 0, "terminologies": 0}

async def get_database_stats() -> Dict[str, int]:
    """Get database statistics"""
    if db is None:
        await init_database()
        
    try:
        sessions_count = await db.sessions.count_documents({})
        
        # Aggregation to count all messages in all sessions
        pipeline = [
            {"$unwind": "$chat_messages"},
            {"$count": "count"}
        ]
        msg_result = await db.sessions.aggregate(pipeline).to_list(1)
        messages_count = msg_result[0]['count'] if msg_result else 0
        
        # Aggregation for terminologies (stored as dict keys or list)
        # Current schema: 'terminologies' is a Dict[str, Dict]
        # We need to count keys. 
        # Using $objectToArray to count keys
        pipeline_terms = [
             {"$project": {"terms_array": {"$objectToArray": "$terminologies"}}},
             {"$unwind": "$terms_array"},
             {"$count": "count"}
        ]
        term_result = await db.sessions.aggregate(pipeline_terms).to_list(1)
        terms_count = term_result[0]['count'] if term_result else 0
        
        return {
            "sessions": sessions_count,
            "messages": messages_count,
            "terminologies": terms_count
        }
    except Exception as e:
        print(f"❌ Error getting stats: {e}")
        return {"sessions": 0, "messages": 0, "terminologies": 0}

# Session operations
async def create_session(session_id: str, name: str, transcript: str, chat_messages: List[Dict]) -> bool:
    """Create a new session"""
    if db is None:
        await init_database()
        
    try:
        session_doc = {
            "id": session_id,
            "name": name,
            "timestamp": datetime.now().isoformat(),
            "transcript": transcript,
            "summary": None,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "chat_messages": chat_messages,
            "terminologies": {},
            "qa_pairs": []
        }
        
        await db.sessions.insert_one(session_doc)
        print(f"✅ Session {session_id} created")
        return True
    except Exception as e:
        print(f"❌ Error creating session: {e}")
        return False

async def get_all_sessions() -> List[Dict]:
    """Get all sessions"""
    if db is None:
        await init_database()
        
    try:
        cursor = db.sessions.find(
            {}, 
            {"_id": 0, "id": 1, "name": 1, "timestamp": 1, "transcript": 1, "summary": 1, "created_at": 1, "chat_messages": 1, "terminologies": 1}
        ).sort("timestamp", -1)
        
        sessions = await cursor.to_list(length=100)
        
        # Format chat messages and terminologies to match frontend expectation if needed
        # (Frontend expects 'chat' key, we stored as 'chat_messages')
        for s in sessions:
            s['chat'] = s.get('chat_messages', [])
            # terminologies is already a dict, assuming correct format
        
        return sessions
    except Exception as e:
        print(f"❌ Error getting sessions: {e}")
        return []

async def get_session_by_id(session_id: str) -> Optional[Dict]:
    """Get a specific session by ID"""
    if db is None:
        await init_database()

    try:
        session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
        if not session:
            return None
            
        # Rename keys to match frontend expectations
        session['chat'] = session.get('chat_messages', [])
        session['qa'] = session.get('qa_pairs', [])
        
        return session
    except Exception as e:
        print(f"❌ Error getting session: {e}")
        return None

async def update_session_summary(session_id: str, summary: str) -> bool:
    """Update session summary"""
    if db is None:
        await init_database()

    try:
        result = await db.sessions.update_one(
            {"id": session_id},
            {
                "$set": {
                    "summary": summary,
                    "updated_at": datetime.now().isoformat()
                }
            }
        )
        if result.modified_count > 0:
            print(f"✅ Summary updated for session {session_id}")
            return True
        return False
    except Exception as e:
        print(f"❌ Error updating summary: {e}")
        return False

async def add_terminologies(session_id: str, terminologies: Dict[str, Dict]) -> bool:
    """Add terminologies for a session"""
    if db is None:
        await init_database()

    try:
        # We replace the entire terminologies object or merge?
        # The SQLite impl deleted existing and inserted new.
        # We will set the field.
        result = await db.sessions.update_one(
            {"id": session_id},
            {"$set": {"terminologies": terminologies}}
        )
        print(f"✅ Terminologies added for session {session_id}")
        return True
    except Exception as e:
        print(f"❌ Error adding terminologies: {e}")
        return False

async def add_qa_pairs(session_id: str, qa_list: List[Dict]) -> bool:
    """Add Q&A pairs for a session"""
    if db is None:
        await init_database()

    try:
        # Replaces existing QA or appends?
        # SQLite deleted existing. We will overwrite.
        result = await db.sessions.update_one(
            {"id": session_id},
            {"$set": {"qa_pairs": qa_list}}
        )
        print(f"✅ Q&A pairs added for session {session_id}")
        return True
    except Exception as e:
        print(f"❌ Error adding Q&A pairs: {e}")
        return False

async def delete_session(session_id: str) -> bool:
    """Delete a session"""
    if db is None:
        await init_database()

    try:
        result = await db.sessions.delete_one({"id": session_id})
        if result.deleted_count > 0:
            print(f"✅ Session {session_id} deleted")
            return True
        return False
    except Exception as e:
        print(f"❌ Error deleting session: {e}")
        return False

# User operations
async def create_user(name: str, username: str, email: str, password_hash: str) -> bool:
    """Create a new user"""
    if db is None:
        await init_database()

    try:
        user_doc = {
            "name": name,
            "username": username,
            "email": email,
            "password_hash": password_hash,
            "created_at": datetime.now().isoformat()
        }
        await db.users.insert_one(user_doc)
        print(f"✅ User {username} created")
        return True
    except Exception as e:
        # Check for duplicate key error
        if "duplicate key error" in str(e):
             print(f"❌ User text {username} or {email} already exists")
        else:
             print(f"❌ Error creating user: {e}")
        return False

async def get_user_by_username(username: str) -> Optional[Dict]:
    """Get user by username"""
    if db is None:
        await init_database()

    try:
        user = await db.users.find_one({"username": username}, {"_id": 0})
        return user
    except Exception as e:
        print(f"❌ Error getting user: {e}")
        return None

async def get_user_by_email(email: str) -> Optional[Dict]:
    """Get user by email"""
    if db is None:
        await init_database()

    try:
        user = await db.users.find_one({"email": email}, {"_id": 0})
        return user
    except Exception as e:
        print(f"❌ Error getting user: {e}")
        return None
