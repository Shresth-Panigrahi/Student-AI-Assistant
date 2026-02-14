from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

class Database:
    client: AsyncIOMotorClient = None
    db = None

    @classmethod
    async def connect_db(cls):
        """Establish connection to MongoDB"""
        try:
            cls.client = AsyncIOMotorClient(settings.MONGODB_URL)
            cls.db = cls.client[settings.DB_NAME]
            print(f"✅ Connected to MongoDB: {settings.DB_NAME}")
            
            # Create indexes (idempotent)
            await cls.create_indexes()
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            raise e

    @classmethod
    async def close_db(cls):
        """Close connection"""
        if cls.client:
            cls.client.close()
            print("✅ MongoDB connection closed")

    @classmethod
    async def create_indexes(cls):
        """Create necessary indexes"""
        if cls.db is not None:
            # Users
            await cls.db.users.create_index("username", unique=True)
            await cls.db.users.create_index("email", unique=True)
            
            # Sessions
            await cls.db.sessions.create_index("id", unique=True)
            await cls.db.sessions.create_index("timestamp", unique=False)
            
            # Quizzes
            await cls.db.quizzes.create_index("quiz_id", unique=True)
            await cls.db.quizzes.create_index("session_id", unique=False)
            
            # Flashcards
            await cls.db.flashcard_sets.create_index("flashcard_set_id", unique=True)
            await cls.db.flashcard_sets.create_index("session_id", unique=False)
            
            # One Word Questions
            await cls.db.one_word_question_sets.create_index("question_set_id", unique=True)
            await cls.db.one_word_question_sets.create_index("session_id", unique=False)
            
            # Short Answer Questions
            await cls.db.short_answer_question_sets.create_index("question_set_id", unique=True)
            
            # Summaries
            await cls.db.summaries.create_index("summary_id", unique=True)
            await cls.db.summaries.create_index("session_id", unique=False)
            
            # Translations
            await cls.db.translation_configs.create_index("session_id", unique=True) # One config per session
            await cls.db.translations.create_index("session_id", unique=False)

db = Database()
