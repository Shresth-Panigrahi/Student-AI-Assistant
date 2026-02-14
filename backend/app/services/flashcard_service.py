from app.services.ai_service import AIService
from app.database import db
from app.models.flashcard import Flashcard, FlashcardSet
import uuid

class FlashcardService:
    @staticmethod
    async def generate_flashcards(session_id: str, transcript_text: str, num_cards: int = 15, card_types: list = None) -> FlashcardSet:
        flashcard_set_id = str(uuid.uuid4())
        
        types_text = ", ".join(card_types) if card_types else "definitions, concepts, formulas, facts"
        
        prompt = f"""
        Generate a set of study flashcards from the following transcript.
        
        Parameters:
        - Number of cards: {num_cards}
        - Types to focus on: {types_text}
        
        Format Requirement:
        Return a JSON object with a "cards" array.
        Each card object MUST have:
        - "front": Short question or term (max 100 chars)
        - "back": Detailed answer or definition (100-300 chars)
        - "card_type": One of [definition, concept, formula, fact]
        - "difficulty": [easy, medium, hard]
        - "tags": Array of keyword strings
        
        TRANSCRIPT:
        {transcript_text[:15000]}
        """
        
        try:
            ai_data = await AIService.generate_json(prompt)
            cards_data = ai_data.get("cards", [])
            
            parsed_cards = []
            for idx, c in enumerate(cards_data):
                card = Flashcard(
                    card_id=f"fc_{idx}_{uuid.uuid4().hex[:4]}",
                    front=c["front"],
                    back=c["back"],
                    card_type=c.get("card_type", "concept"),
                    difficulty=c.get("difficulty", "medium"),
                    tags=c.get("tags", [])
                )
                parsed_cards.append(card)
                
            flashcard_set = FlashcardSet(
                flashcard_set_id=flashcard_set_id,
                session_id=session_id,
                num_cards=len(parsed_cards),
                cards=parsed_cards
            )
            
            if db.db is not None:
                await db.db.flashcard_sets.insert_one(flashcard_set.dict())
                
            return flashcard_set
        except Exception as e:
            print(f"❌ Flashcard Generation Failed: {e}")
            raise e

    @staticmethod
    async def get_flashcard_set(flashcard_set_id: str) -> FlashcardSet:
        if db.db is None: return None
        data = await db.db.flashcard_sets.find_one({"flashcard_set_id": flashcard_set_id})
        return FlashcardSet(**data) if data else None
