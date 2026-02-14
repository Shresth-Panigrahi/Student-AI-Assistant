from app.services.ai_service import AIService
from app.database import db
from app.models.summary import Summary
import uuid

class SummaryService:
    @staticmethod
    async def generate_summary(session_id: str, transcript_text: str, summary_type: str = "standard", include_key_points: bool = True, include_action_items: bool = True) -> Summary:
        summary_id = str(uuid.uuid4())
        
        length_desc = {
            "brief": "3-5 sentences",
            "standard": "1-2 paragraphs",
            "detailed": "3-5 paragraphs"
        }.get(summary_type, "1-2 paragraphs")
        
        prompt = f"""
        Generate a structured summary of the transcript.
        
        Parameters:
        - Length: {length_desc}
        - Include Key Points: {include_key_points}
        - Include Action Items: {include_action_items}
        
        Format Requirement:
        Return JSON object with:
        - "main_summary": The summary text
        - "key_points": Array of strings (5-10 points)
        - "action_items": Array of strings (homework, tasks mentioned)
        - "main_topics": Array of strings
        
        TRANSCRIPT:
        {transcript_text[:20000]}
        """
        
        try:
            ai_data = await AIService.generate_json(prompt)
            
            main_summary = ai_data.get("main_summary", "")
            
            # Metadata stats
            orig_len = len(transcript_text)
            summ_len = len(main_summary)
            compression = round((1 - (summ_len / orig_len)) * 100, 1) if orig_len > 0 else 0
            
            summary = Summary(
                summary_id=summary_id,
                session_id=session_id,
                main_summary=main_summary,
                key_points=ai_data.get("key_points", []) if include_key_points else [],
                action_items=ai_data.get("action_items", []) if include_action_items else [],
                main_topics=ai_data.get("main_topics", []),
                summary_type=summary_type,
                metadata={
                    "original_length": orig_len,
                    "summary_length": summ_len,
                    "compression_ratio": f"{compression}%"
                }
            )
            
            if db.db is not None:
                await db.db.summaries.insert_one(summary.dict())
                
            return summary
        except Exception as e:
            print(f"❌ Summary Generation Failed: {e}")
            raise e

    @staticmethod
    async def get_summary(summary_id: str) -> Summary:
        if db.db is None: return None
        data = await db.db.summaries.find_one({"summary_id": summary_id})
        return Summary(**data) if data else None
