"""
Flashcard Generator — Groq-based flashcard generation
Generates concise Q/A flashcards from lecture transcripts.
"""
import os
import json
import re
from dotenv import load_dotenv
from groq import Groq

load_dotenv()


def generate_flashcards(transcript: str, context_files_text: str = "", count: int = 15) -> list[dict]:
    """
    Generate flashcards from a lecture transcript using Groq API.
    
    Args:
        transcript: The lecture transcript text
        context_files_text: Additional context from uploaded files
        count: Number of flashcards to generate (default 15)
        
    Returns:
        List of dicts with keys: question, answer, category
    """
    if not transcript or len(transcript.strip()) < 50:
        return []

    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    if not client:
        print("❌ Groq client not initialized")
        return []

    system_prompt = f"""You are an expert educator creating flashcards for university students. Generate exactly {count} flashcards from the provided lecture transcript. Each flashcard question must be extremely concise: 3 to 7 words maximum, or one short sentence maximum 10 words. The question should test recall of a specific fact, definition, formula, concept name, or relationship. The answer must be short: 1 to 2 sentences maximum, precise, and directly answerable. Do not generate opinion questions. Do not generate questions that cannot be answered from the transcript alone.

Respond ONLY with a valid JSON array, no other text, no markdown code fences:
[
  {{"question": "short question here", "answer": "precise answer here", "category": "one word category like Definition/Formula/Concept/Application/Person"}},
  ...
]"""

    context_section = ""
    if context_files_text and context_files_text.strip():
        context_section = f"\nAdditional context:\n{context_files_text}"

    user_prompt = f"""Generate {count} flashcards from this lecture transcript:
{transcript}
{context_section}"""

    # First attempt
    flashcards = _call_and_parse(client, system_prompt, user_prompt, temperature=0.4)
    
    # Retry with lower temperature on failure
    if not flashcards:
        print("🔁 Retrying flashcard generation with temperature 0.1...")
        flashcards = _call_and_parse(client, system_prompt, user_prompt, temperature=0.1)

    if flashcards:
        print(f"✅ Generated {len(flashcards)} flashcards")
    else:
        print("❌ Failed to generate flashcards after retry")
    
    return flashcards


def _call_and_parse(client: Groq, system_prompt: str, user_prompt: str, temperature: float) -> list[dict]:
    """Call Groq API and parse the JSON response."""
    try:
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="moonshotai/kimi-k2-instruct-0905",
            temperature=temperature,
        )
        
        raw = completion.choices[0].message.content.strip()
        print(f"📝 Raw flashcard response: {raw[:300]}...")
        
        return _parse_flashcards_json(raw)
        
    except Exception as e:
        print(f"❌ Flashcard generation error: {e}")
        return []


def _parse_flashcards_json(text: str) -> list[dict]:
    """Parse flashcard JSON from LLM response."""
    try:
        # Clean markdown code fences if present
        cleaned = text.replace("```json", "").replace("```", "").strip()
        
        # Try to find JSON array
        json_match = re.search(r'\[.*\]', cleaned, re.DOTALL)
        if json_match:
            json_str = json_match.group()
        else:
            json_str = cleaned
        
        items = json.loads(json_str)
        
        valid = []
        for item in items:
            if isinstance(item, dict) and "question" in item and "answer" in item:
                valid.append({
                    "question": item["question"].strip(),
                    "answer": item["answer"].strip(),
                    "category": item.get("category", "Concept").strip()
                })
        
        return valid
        
    except (json.JSONDecodeError, Exception) as e:
        print(f"❌ JSON flashcard parsing error: {e}")
        return []
