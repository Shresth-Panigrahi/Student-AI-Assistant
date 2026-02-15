from fastapi import APIRouter, HTTPException
from app.services.translation_service import TranslationService
from app.models.translation import TranslationConfig, ConfigTranslationRequest, TranslateTextRequest, TranslationLog
from app.database import db

router = APIRouter()

@router.post("/api/translate/configure", response_model=TranslationConfig)
async def configure_translation(request: ConfigTranslationRequest):
    try:
        return await TranslationService.configure_mode(
            session_id=request.session_id,
            mode=request.mode,
            primary=request.primary_language,
            secondary=request.secondary_language
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/translate/text", response_model=TranslationLog)
async def translate_text(request: TranslateTextRequest):
    try:
        return await TranslationService.translate_text(
            session_id=request.session_id,
            text=request.text,
            target_lang=request.target_language
        )
    except ValueError as e:
        # Return 403 Forbidden for disabled translation
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/translate/config/{session_id}", response_model=TranslationConfig)
async def get_translation_config(session_id: str):
    config = await TranslationService.get_config(session_id)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return config
