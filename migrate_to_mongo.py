"""
Migration script to transfer data from SQLite to MongoDB
"""
import sys
sys.path.append('.')

from backend import database as sqlite_db
from backend import database_mongo as mongo_db

def migrate_sessions():
    """Migrate all sessions from SQLite to MongoDB"""
    print("🔄 Migrating sessions...")
    
    # Get all sessions from SQLite
    sessions = sqlite_db.get_all_sessions()
    print(f"Found {len(sessions)} sessions in SQLite")
    
    migrated = 0
    for session in sessions:
        try:
            # Create session in MongoDB
            success = mongo_db.create_session(
                session_id=session['id'],
                name=session['name'],
                transcript=session['transcript'],
                chat_messages=session.get('chat', [])
            )
            
            if success:
                # Add summary if exists
                if session.get('summary'):
                    mongo_db.update_session_summary(session['id'], session['summary'])
                
                # Add terminologies if exist
                if session.get('terminologies'):
                    mongo_db.add_terminologies(session['id'], session['terminologies'])
                
                # Add Q&A pairs if exist
                if session.get('qa'):
                    mongo_db.add_qa_pairs(session['id'], session['qa'])
                
                migrated += 1
                print(f"✅ Migrated session: {session['name']}")
        except Exception as e:
            print(f"❌ Failed to migrate session {session['id']}: {e}")
    
    print(f"\n✅ Migration complete: {migrated}/{len(sessions)} sessions migrated")

def migrate_users():
    """Migrate users from SQLite to MongoDB"""
    print("\n🔄 Migrating users...")
    
    # Note: SQLite database doesn't expose a get_all_users function
    # Users will need to be recreated or manually migrated if needed
    print("⚠️  User migration not implemented (no users in current SQLite DB)")

if __name__ == "__main__":
    print("=" * 50)
    print("SQLite to MongoDB Migration")
    print("=" * 50)
    
    try:
        migrate_sessions()
        migrate_users()
        
        print("\n" + "=" * 50)
        print("Migration Summary")
        print("=" * 50)
        
        # Show stats
        sqlite_stats = sqlite_db.get_database_stats()
        mongo_stats = mongo_db.get_database_stats()
        
        print(f"\nSQLite Stats:")
        print(f"  Sessions: {sqlite_stats['sessions']}")
        print(f"  Messages: {sqlite_stats['messages']}")
        print(f"  Terminologies: {sqlite_stats['terminologies']}")
        
        print(f"\nMongoDB Stats:")
        print(f"  Sessions: {mongo_stats['sessions']}")
        print(f"  Messages: {mongo_stats['messages']}")
        print(f"  Terminologies: {mongo_stats['terminologies']}")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)
