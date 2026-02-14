"""
MongoDB database layer for AI Student Assistant
Maintains same function signatures as SQLite version for easy migration
"""
from pymongo import MongoClient, ASCENDING, DESCENDING
from datetime import datetime
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DATABASE_NAME = "ai_student_assistant"

# Global client instance
_client: Optional[MongoClient] = None
_db = None

def get_database():
    """Get MongoDB database instance"""
    global _client, _db
    if _client is None:
        _client = MongoClient(MONGODB_URI)
        _db = _client[DATABASE_NAME]
        print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
    return _db

def init_database():
    """Initialize MongoDB collections and indexes"""
    try:
        db = get_database()
        
        # Create indexes for sessions collection
        db.sessions.create_index([("timestamp", DESCENDING)])
        db.sessions.create_index([("name", ASCENDING)])
        
        # Create indexes for users collection
        db.users.create_index([("username", ASCENDING)], unique=True)
        db.users.create_index([("email", ASCENDING)], unique=True)
        
        print("✅ MongoDB initialized successfully")
    except Exception as e:
        print(f"❌ Error initializing MongoDB: {e}")

# Session operations
def create_session(session_id: str, name: str, transcript: str, chat_messages: List[Dict]) -> bool:
    """Create a new session"""
    try:
        db = get_database()
        
        session_doc = {
            "_id": session_id,
            "name": name,
            "timestamp": datetime.now().isoformat(),
            "transcript": transcript,
            "summary": None,
            "chat_messages": chat_messages,
            "terminologies": {},
            "qa_pairs": [],
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        db.sessions.insert_one(session_doc)
        print(f"✅ Session {session_id} created")
        return True
    except Exception as e:
        print(f"❌ Error creating session: {e}")
        return False

def get_all_sessions() -> List[Dict]:
    """Get all sessions"""
    try:
        db = get_database()
        sessions = list(db.sessions.find().sort("timestamp", DESCENDING))
        
        # Convert _id to id for compatibility
        for session in sessions:
            session['id'] = session.pop('_id')
            # Convert datetime to ISO string
            if isinstance(session.get('created_at'), datetime):
                session['created_at'] = session['created_at'].isoformat()
            if isinstance(session.get('updated_at'), datetime):
                session['updated_at'] = session['updated_at'].isoformat()
            # Rename chat_messages to chat for compatibility
            if 'chat_messages' in session:
                session['chat'] = session.pop('chat_messages')
            # Rename qa_pairs to qa for compatibility
            if 'qa_pairs' in session:
                session['qa'] = session.pop('qa_pairs')
        
        return sessions
    except Exception as e:
        print(f"❌ Error getting sessions: {e}")
        return []

def get_session_by_id(session_id: str) -> Optional[Dict]:
    """Get a specific session by ID"""
    try:
        db = get_database()
        session = db.sessions.find_one({"_id": session_id})
        
        if not session:
            return None
        
        # Convert _id to id for compatibility
        session['id'] = session.pop('_id')
        # Convert datetime to ISO string
        if isinstance(session.get('created_at'), datetime):
            session['created_at'] = session['created_at'].isoformat()
        if isinstance(session.get('updated_at'), datetime):
            session['updated_at'] = session['updated_at'].isoformat()
        # Rename chat_messages to chat for compatibility
        if 'chat_messages' in session:
            session['chat'] = session.pop('chat_messages')
        # Rename qa_pairs to qa for compatibility
        if 'qa_pairs' in session:
            session['qa'] = session.pop('qa_pairs')
        
        return session
    except Exception as e:
        print(f"❌ Error getting session: {e}")
        return None

def update_session_summary(session_id: str, summary: str) -> bool:
    """Update session summary"""
    try:
        db = get_database()
        result = db.sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "summary": summary,
                    "updated_at": datetime.now()
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

def add_terminologies(session_id: str, terminologies: Dict[str, Dict]) -> bool:
    """Add terminologies for a session"""
    try:
        db = get_database()
        result = db.sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "terminologies": terminologies,
                    "updated_at": datetime.now()
                }
            }
        )
        
        if result.modified_count > 0:
            print(f"✅ Terminologies added for session {session_id}")
            return True
        return False
    except Exception as e:
        print(f"❌ Error adding terminologies: {e}")
        return False

def add_qa_pairs(session_id: str, qa_list: List[Dict]) -> bool:
    """Add Q&A pairs for a session"""
    try:
        db = get_database()
        result = db.sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    "qa_pairs": qa_list,
                    "updated_at": datetime.now()
                }
            }
        )
        
        if result.modified_count > 0:
            print(f"✅ Q&A pairs added for session {session_id}")
            return True
        return False
    except Exception as e:
        print(f"❌ Error adding Q&A pairs: {e}")
        return False

def delete_session(session_id: str) -> bool:
    """Delete a session"""
    try:
        db = get_database()
        result = db.sessions.delete_one({"_id": session_id})
        
        if result.deleted_count > 0:
            print(f"✅ Session {session_id} deleted")
            return True
        return False
    except Exception as e:
        print(f"❌ Error deleting session: {e}")
        return False

# User authentication operations
def create_user(name: str, username: str, email: str, password_hash: str) -> bool:
    """Create a new user"""
    try:
        db = get_database()
        
        user_doc = {
            "name": name,
            "username": username,
            "email": email,
            "password_hash": password_hash,
            "created_at": datetime.now()
        }
        
        db.users.insert_one(user_doc)
        print(f"✅ User {username} created")
        return True
    except Exception as e:
        if "duplicate key" in str(e).lower():
            print(f"❌ User {username} or {email} already exists")
        else:
            print(f"❌ Error creating user: {e}")
        return False

def get_user_by_username(username: str) -> Optional[Dict]:
    """Get user by username"""
    try:
        db = get_database()
        user = db.users.find_one({"username": username})
        
        if user:
            user['id'] = str(user.pop('_id'))
            if isinstance(user.get('created_at'), datetime):
                user['created_at'] = user['created_at'].isoformat()
        
        return user
    except Exception as e:
        print(f"❌ Error getting user: {e}")
        return None

def get_user_by_email(email: str) -> Optional[Dict]:
    """Get user by email"""
    try:
        db = get_database()
        user = db.users.find_one({"email": email})
        
        if user:
            user['id'] = str(user.pop('_id'))
            if isinstance(user.get('created_at'), datetime):
                user['created_at'] = user['created_at'].isoformat()
        
        return user
    except Exception as e:
        print(f"❌ Error getting user: {e}")
        return None

def get_database_stats() -> Dict[str, int]:
    """Get database statistics"""
    try:
        db = get_database()
        
        sessions_count = db.sessions.count_documents({})
        
        # Count total chat messages across all sessions
        pipeline = [
            {"$project": {"message_count": {"$size": "$chat_messages"}}},
            {"$group": {"_id": None, "total": {"$sum": "$message_count"}}}
        ]
        messages_result = list(db.sessions.aggregate(pipeline))
        messages_count = messages_result[0]['total'] if messages_result else 0
        
        # Count total terminologies across all sessions
        pipeline = [
            {"$project": {"term_count": {"$size": {"$objectToArray": "$terminologies"}}}},
            {"$group": {"_id": None, "total": {"$sum": "$term_count"}}}
        ]
        terms_result = list(db.sessions.aggregate(pipeline))
        terms_count = terms_result[0]['total'] if terms_result else 0
        
        return {
            "sessions": sessions_count,
            "messages": messages_count,
            "terminologies": terms_count
        }
    except Exception as e:
        print(f"❌ Error getting stats: {e}")
        return {"sessions": 0, "messages": 0, "terminologies": 0}

# Initialize database on module import
init_database()
