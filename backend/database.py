import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Optional, Any
from contextlib import contextmanager

DATABASE_PATH = "ai_assistant.db"

@contextmanager
def get_db():
    """Context manager for database connections"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def init_database():
    """Initialize the database with required tables"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                transcript TEXT NOT NULL,
                summary TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Chat messages table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)
        
        # Terminologies table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS terminologies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                term TEXT NOT NULL,
                original_term TEXT NOT NULL,
                category TEXT,
                importance TEXT,
                subject_area TEXT,
                definition TEXT,
                source TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        """)
        
        # Create indexes for better performance
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sessions_timestamp 
            ON sessions(timestamp DESC)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session 
            ON chat_messages(session_id)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_terminologies_session 
            ON terminologies(session_id)
        """)
        
        print("✅ Database initialized successfully")

# Session operations
def create_session(session_id: str, name: str, transcript: str, chat_messages: List[Dict]) -> bool:
    """Create a new session"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Insert session
            cursor.execute("""
                INSERT INTO sessions (id, name, timestamp, transcript)
                VALUES (?, ?, ?, ?)
            """, (session_id, name, datetime.now().isoformat(), transcript))
            
            # Insert chat messages
            for msg in chat_messages:
                cursor.execute("""
                    INSERT INTO chat_messages (session_id, role, content, timestamp)
                    VALUES (?, ?, ?, ?)
                """, (session_id, msg.get('role'), msg.get('content'), msg.get('timestamp', datetime.now().isoformat())))
            
            print(f"✅ Session {session_id} created")
            return True
    except Exception as e:
        print(f"❌ Error creating session: {e}")
        return False

def get_all_sessions() -> List[Dict]:
    """Get all sessions"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, timestamp, transcript, summary, created_at
                FROM sessions
                ORDER BY timestamp DESC
            """)
            
            sessions = []
            for row in cursor.fetchall():
                session = dict(row)
                
                # Get chat messages for this session
                cursor.execute("""
                    SELECT role, content, timestamp
                    FROM chat_messages
                    WHERE session_id = ?
                    ORDER BY created_at
                """, (session['id'],))
                
                session['chat'] = [dict(msg) for msg in cursor.fetchall()]
                
                # Get terminologies if any
                cursor.execute("""
                    SELECT term, original_term, category, importance, 
                           subject_area, definition, source
                    FROM terminologies
                    WHERE session_id = ?
                """, (session['id'],))
                
                terms = cursor.fetchall()
                if terms:
                    session['terminologies'] = {
                        row['term']: dict(row) for row in terms
                    }
                
                sessions.append(session)
            
            return sessions
    except Exception as e:
        print(f"❌ Error getting sessions: {e}")
        return []

def get_session_by_id(session_id: str) -> Optional[Dict]:
    """Get a specific session by ID"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, timestamp, transcript, summary, created_at
                FROM sessions
                WHERE id = ?
            """, (session_id,))
            
            row = cursor.fetchone()
            if not row:
                return None
            
            session = dict(row)
            
            # Get chat messages
            cursor.execute("""
                SELECT role, content, timestamp
                FROM chat_messages
                WHERE session_id = ?
                ORDER BY created_at
            """, (session_id,))
            
            session['chat'] = [dict(msg) for msg in cursor.fetchall()]
            
            # Get terminologies
            cursor.execute("""
                SELECT term, original_term, category, importance, 
                       subject_area, definition, source
                FROM terminologies
                WHERE session_id = ?
            """, (session_id,))
            
            terms = cursor.fetchall()
            if terms:
                session['terminologies'] = {
                    row['term']: dict(row) for row in terms
                }
            
            return session
    except Exception as e:
        print(f"❌ Error getting session: {e}")
        return None

def update_session_summary(session_id: str, summary: str) -> bool:
    """Update session summary"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE sessions
                SET summary = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (summary, session_id))
            
            print(f"✅ Summary updated for session {session_id}")
            return True
    except Exception as e:
        print(f"❌ Error updating summary: {e}")
        return False

def add_terminologies(session_id: str, terminologies: Dict[str, Dict]) -> bool:
    """Add terminologies for a session"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Delete existing terminologies for this session
            cursor.execute("DELETE FROM terminologies WHERE session_id = ?", (session_id,))
            
            # Insert new terminologies
            for term, info in terminologies.items():
                cursor.execute("""
                    INSERT INTO terminologies 
                    (session_id, term, original_term, category, importance, 
                     subject_area, definition, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_id,
                    term,
                    info.get('original_term', term),
                    info.get('category'),
                    info.get('importance'),
                    info.get('subject_area'),
                    info.get('definition'),
                    info.get('source')
                ))
            
            print(f"✅ Terminologies added for session {session_id}")
            return True
    except Exception as e:
        print(f"❌ Error adding terminologies: {e}")
        return False

def delete_session(session_id: str) -> bool:
    """Delete a session and all related data"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            print(f"✅ Session {session_id} deleted")
            return True
    except Exception as e:
        print(f"❌ Error deleting session: {e}")
        return False

def get_database_stats() -> Dict[str, int]:
    """Get database statistics"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) as count FROM sessions")
            sessions_count = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM chat_messages")
            messages_count = cursor.fetchone()['count']
            
            cursor.execute("SELECT COUNT(*) as count FROM terminologies")
            terms_count = cursor.fetchone()['count']
            
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
