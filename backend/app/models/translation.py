from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class TranslationMode(str, Enum):
    SINGLE = "single"
    BILINGUAL = "bilingual"

class TranslationConfig(BaseModel):
    config_id: str
    session_id: str
    mode: TranslationMode
    primary_language: str = "en"
    secondary_language: Optional[str] = None
    translation_enabled: bool
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class TranslationLog(BaseModel):
    translation_id: str
    session_id: str
    original_text: str
    translated_text: str
    source_language: str
    target_language: str
    translated_at: datetime = Field(default_factory=datetime.utcnow)

class ConfigTranslationRequest(BaseModel):
    session_id: str
    mode: TranslationMode
    primary_language: str = "en"
    secondary_language: str = "hi"

class TranslateTextRequest(BaseModel):
    session_id: str
    text: str
    target_language: str
