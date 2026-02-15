from app.services.ai_service import AIService
from app.database import db
from app.models.translation import TranslationConfig, TranslationMode, TranslationLog
import uuid
from datetime import datetime

class TranslationService:
    @staticmethod
    async def configure_mode(session_id: str, mode: TranslationMode, primary: str = "en", secondary: str = "hi") -> TranslationConfig:
        config_id = str(uuid.uuid4())
        
        # Logic: Translation enabled ONLY if bilingual
        is_enabled = (mode == TranslationMode.BILINGUAL)
        
        config = TranslationConfig(
            config_id=config_id,
            session_id=session_id,
            mode=mode,
            primary_language=primary,
            secondary_language=secondary if is_enabled else None,
            translation_enabled=is_enabled,
            updated_at=datetime.utcnow()
        )
        
        if db.db is not None:
            # Upsert config for session
            await db.db.translation_configs.update_one(
                {"session_id": session_id},
                {"$set": config.dict()},
                upsert=True
            )
            
        return config

    @staticmethod
    async def is_translation_enabled(session_id: str) -> bool:
        if db.db is None: return False
        data = await db.db.translation_configs.find_one({"session_id": session_id})
        if not data:
            return False # Default to disabled if no config
        config = TranslationConfig(**data)
        return config.translation_enabled

    @staticmethod
    async def translate_text(session_id: str, text: str, target_lang: str) -> TranslationLog:
            
        # Call AI
        prompt = f"""
        Translate the following text to {target_lang}.
        Return ONLY the translated text. No explanations.
        
        Text: {text}
        """
        
        try:
            translated_text = await AIService.generate_content(prompt)
            translated_text = translated_text.strip()
            
            log = TranslationLog(
                translation_id=str(uuid.uuid4()),
                session_id=session_id,
                original_text=text,
                translated_text=translated_text,
                source_language="en", # Assuming source is English/Primary
                target_language=target_lang
            )
            
            if db.db is not None:
                await db.db.translations.insert_one(log.dict())
                
            return log
        except Exception as e:
            print(f"❌ Translation Failed: {e}")
            raise e

    @staticmethod
    async def get_config(session_id: str) -> TranslationConfig:
        if db.db is None: return None
        data = await db.db.translation_configs.find_one({"session_id": session_id})
        return TranslationConfig(**data) if data else None
