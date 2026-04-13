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

def update_session_field(session_id: str, field: str, value) -> bool:
    """Generic helper to update any field on a session document"""
    try:
        db = get_database()
        result = db.sessions.update_one(
            {"_id": session_id},
            {
                "$set": {
                    field: value,
                    "updated_at": datetime.now()
                }
            }
        )
        if result.modified_count > 0 or result.matched_count > 0:
            print(f"✅ Field '{field}' updated for session {session_id}")
            return True
        return False
    except Exception as e:
        print(f"❌ Error updating field '{field}': {e}")
        return False


def update_session_flashcards(session_id: str, flashcards: list) -> bool:
    """Save flashcards for a session"""
    return update_session_field(session_id, "flashcards", flashcards)


def update_session_qa_analysis(session_id: str, qa_analysis: list) -> bool:
    """Save Q&A analysis for a session"""
    return update_session_field(session_id, "qa_analysis", qa_analysis)


def create_upload_session(session_id: str, name: str, topic: str = "", user_id: str = "") -> bool:
    """Create a new session from an uploaded recording (processing state)"""
    try:
        db = get_database()

        session_doc = {
            "_id": session_id,
            "name": name,
            "timestamp": datetime.now().isoformat(),
            "transcript": "",
            "summary": None,
            "chat_messages": [],
            "terminologies": {},
            "qa_pairs": [],
            "source": "upload",
            "processing_status": "processing",
            "processing_stage": "converting",
            "processing_error": None,
            "topic": topic,
            "user_id": user_id,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }

        db.sessions.insert_one(session_doc)
        print(f"✅ Upload session {session_id} created (processing)")
        return True
    except Exception as e:
        print(f"❌ Error creating upload session: {e}")
        return False


def update_processing_status(
    session_id: str,
    status: str,
    stage: str,
    error: str = None,
    transcript: str = None
) -> bool:
    """Update processing status fields on a session document"""
    try:
        db = get_database()
        update_fields = {
            "processing_status": status,
            "processing_stage": stage,
            "updated_at": datetime.now()
        }
        if error is not None:
            update_fields["processing_error"] = error
        if transcript is not None:
            update_fields["transcript"] = transcript

        result = db.sessions.update_one(
            {"_id": session_id},
            {"$set": update_fields}
        )
        if result.matched_count > 0:
            print(f"✅ Processing status updated for {session_id}: {stage} ({status})")
            return True
        return False
    except Exception as e:
        print(f"❌ Error updating processing status: {e}")
        return False


def save_chat_thread(session_id: str, thread_id: str, messages: list, title: str = None) -> bool:
    """Save messages to a specific chat thread in a session"""
    try:
        db = get_database()
        session = db.sessions.find_one({"_id": session_id}, {"chat_threads": 1})
        threads = session.get("chat_threads", []) if session else []

        # Find existing thread or create new
        found = False
        for t in threads:
            if t["thread_id"] == thread_id:
                t["messages"] = messages
                t["updated_at"] = datetime.now().isoformat()
                if title:
                    t["title"] = title
                elif not t.get("title") and messages:
                    # Auto-title from first user message
                    for m in messages:
                        if m.get("role") == "user":
                            t["title"] = m["content"][:80] + ("..." if len(m["content"]) > 80 else "")
                            break
                found = True
                break

        if not found:
            # Auto-title from first user message
            auto_title = title or "New Chat"
            if not title and messages:
                for m in messages:
                    if m.get("role") == "user":
                        auto_title = m["content"][:80] + ("..." if len(m["content"]) > 80 else "")
                        break
            threads.append({
                "thread_id": thread_id,
                "title": auto_title,
                "messages": messages,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            })

        result = db.sessions.update_one(
            {"_id": session_id},
            {"$set": {"chat_threads": threads, "updated_at": datetime.now()}}
        )
        if result.matched_count > 0:
            print(f"✅ Chat thread {thread_id} saved for session {session_id} ({len(messages)} msgs)")
            return True
        return False
    except Exception as e:
        print(f"❌ Error saving chat thread: {e}")
        return False


def get_chat_threads(session_id: str) -> list:
    """Get all chat threads for a session"""
    try:
        db = get_database()
        session = db.sessions.find_one({"_id": session_id}, {"chat_threads": 1})
        if session and "chat_threads" in session:
            return session["chat_threads"]
        return []
    except Exception as e:
        print(f"❌ Error getting chat threads: {e}")
        return []


def get_thread_messages(session_id: str, thread_id: str) -> list:
    """Get messages for a specific chat thread"""
    try:
        db = get_database()
        session = db.sessions.find_one({"_id": session_id}, {"chat_threads": 1})
        if session:
            for t in session.get("chat_threads", []):
                if t["thread_id"] == thread_id:
                    return t.get("messages", [])
        return []
    except Exception as e:
        print(f"❌ Error getting thread messages: {e}")
        return []


def delete_chat_thread(session_id: str, thread_id: str) -> bool:
    """Delete a specific chat thread from a session"""
    try:
        db = get_database()
        result = db.sessions.update_one(
            {"_id": session_id},
            {
                "$pull": {"chat_threads": {"thread_id": thread_id}},
                "$set": {"updated_at": datetime.now()}
            }
        )
        if result.matched_count > 0:
            print(f"✅ Chat thread {thread_id} deleted from session {session_id}")
            return True
        return False
    except Exception as e:
        print(f"❌ Error deleting chat thread: {e}")
        return False


def get_all_chat_histories() -> list:
    """Get all sessions that have chat threads, with thread details"""
    try:
        db = get_database()
        sessions = list(db.sessions.find(
            {
                "chat_threads": {"$exists": True, "$ne": []},
                "$expr": {"$gt": [{"$size": "$chat_threads"}, 0]}
            },
            {
                "_id": 1,
                "name": 1,
                "timestamp": 1,
                "chat_threads": 1,
                "updated_at": 1
            }
        ).sort("updated_at", DESCENDING))

        result = []
        for s in sessions:
            threads = s.get("chat_threads", [])
            for t in threads:
                messages = t.get("messages", [])
                if not messages:
                    continue
                last_msg = messages[-1] if messages else None
                result.append({
                    "session_id": s["_id"],
                    "session_name": s.get("name", "Untitled"),
                    "thread_id": t["thread_id"],
                    "thread_title": t.get("title", "New Chat"),
                    "message_count": len(messages),
                    "last_message": {
                        "role": last_msg.get("role", "") if last_msg else "",
                        "content": (last_msg.get("content", "")[:100] + "...") if last_msg and len(last_msg.get("content", "")) > 100 else (last_msg.get("content", "") if last_msg else ""),
                        "timestamp": last_msg.get("timestamp", "") if last_msg else ""
                    },
                    "created_at": t.get("created_at", ""),
                    "updated_at": t.get("updated_at", "")
                })

        # Sort by updated_at descending
        result.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return result
    except Exception as e:
        print(f"❌ Error getting all chat histories: {e}")
        return []


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
