import os
import json
import re
from typing import Dict, Any
from dotenv import load_dotenv

# Use appropriate LangChain/Groq imports
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

SYSTEM_PROMPT = """You are an expert video producer designed to convert transcripts into structured animation JSON scripts for a video render engine.

CRITICAL RULE (NON-NEGOTIABLE):
You must output STRICT JSON format. Do not use Markdown JSON fences wrapper blocks (like ```json), just raw JSON. Do not include any text outside the JSON.

JSON SCHEMA:
{
  "title": "string",
  "scenes": [
    {
      "type": "title | bullet | equation | diagram | highlight | split",
      "content": {},
      "duration": number (seconds, usually between 4 and 10)
    }
  ]
}

SCENE DEFINITIONS:

1. Title Scene
{ "type": "title", "content": { "text": "Main title", "subtitle": "Optional" }, "duration": 4 }

2. Bullet Scene
{ "type": "bullet", "content": { "points": ["Short point 1", "Short point 2", "Short point 3"] }, "duration": 8 }

3. Equation Scene
{ "type": "equation", "content": { "latex": "y = wx + b" }, "duration": 6 }

4. Diagram Scene
{ "type": "diagram", "content": { "diagram_type": "flow | tree | graph", "nodes": ["A", "B"], "edges": [["A", "B"]] }, "duration": 10 }

5. Highlight Scene
{ "type": "highlight", "content": { "text": "Important concept" }, "duration": 5 }

6. Split Comparison
{ "type": "split", "content": { "left": ["A1"], "right": ["B1"] }, "duration": 8 }


RULES:
- Always start with a "title" scene
- Limit text length so it fits elegantly on a 1920x1080 screen
- Use 8-15 scenes for the video
- The duration should represent how long it takes to read and digest the info
- ONLY RETURN VALID RAW JSON. No prefixes, no suffixes.
"""

def generate_video_script(transcript: str, session_title: str) -> Dict[str, Any]:
    """
    Calls Groq to transform a transcript into a structured scene JSON.
    """
    client = ChatGroq(
        model="llama-3.3-70b-versatile",  # Strong reasoning model for valid JSON
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.3
    )

    user_prompt = f"Session Title: {session_title}\n\nTranscript:\n{transcript[:8000]}\n\nGenerate the JSON video script."

    response = client.invoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_prompt)
    ])

    raw_text = response.content.strip()

    # Clean up potential markdown blocks if the model ignored the instruction
    raw_text = re.sub(r'```json\s*', '', raw_text)
    raw_text = re.sub(r'```\s*', '', raw_text)

    # Find the outermost JSON object
    match = re.search(r'(\{.*\})', raw_text, re.DOTALL)
    if match:
        raw_text = match.group(1)

    try:
        script_data = json.loads(raw_text)
        return script_data
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON from LLM: {raw_text[:200]}...")
        raise RuntimeError(f"LLM generated invalid JSON: {e}")
