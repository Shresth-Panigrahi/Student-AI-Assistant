"""
Dynamic course prompt generation using Gemini AI.
Generates domain-specific keywords for a lecture topic, builds an initial prompt
for Whisper, and creates hallucination leak patterns to filter prompt echoes.
"""
import os
import re
import json
import google.generativeai as genai
from typing import Tuple, List, Optional
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
_gemini_configured = False
try:
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        _gemini_configured = True
        print("✅ Gemini configured for course prompts")
    else:
        print("⚠️  GEMINI_API_KEY not found — course prompts will use fallback")
except Exception as e:
    print(f"⚠️  Failed to configure Gemini for course prompts: {e}")


# ============================================================
# GEMINI-POWERED KEYWORD GENERATION
# ============================================================

def generate_keywords(topic: str) -> Tuple[str, List[str]]:
    """
    Call Gemini AI to generate relevant keywords/terms for a lecture topic.
    
    Args:
        topic: The lecture topic provided by the user (e.g. "Data Structures", "Operating Systems")
        
    Returns:
        Tuple of (course_name, list_of_keywords)
        Falls back to generic terms if Gemini is unavailable.
    """
    if not _gemini_configured or not topic or not topic.strip():
        return _fallback_keywords(topic)
    
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        prompt = f"""You are helping configure a speech-to-text system for a lecture on: "{topic}"

Return a JSON object with exactly two fields:
1. "course_name": A clean, concise name for this course/subject (e.g. "Data Structures and Algorithms")
2. "keywords": A list of 15-20 key technical terms, jargon, proper nouns, and abbreviations 
   that a student would hear in this lecture. Include both full forms and abbreviations where relevant.

IMPORTANT: Return ONLY the JSON, no markdown formatting, no code fences, no explanation.

Example for "DSA":
{{"course_name": "Data Structures and Algorithms", "keywords": ["algorithm", "binary tree", "linked list", "hash table", "Big O notation", "stack", "queue", "graph traversal", "BFS", "DFS", "sorting", "merge sort", "dynamic programming", "recursion", "heap", "AVL tree", "time complexity", "space complexity"]}}

Now generate for: "{topic}"
"""
        
        response = model.generate_content(prompt)
        result_text = response.text.strip()
        
        # Clean potential markdown fencing
        if result_text.startswith("```"):
            result_text = re.sub(r'^```\w*\n?', '', result_text)
            result_text = re.sub(r'\n?```$', '', result_text)
            result_text = result_text.strip()
        
        data = json.loads(result_text)
        course_name = data.get("course_name", topic)
        keywords = data.get("keywords", [])
        
        if not keywords:
            return _fallback_keywords(topic)
        
        print(f"✅ Gemini generated {len(keywords)} keywords for '{course_name}'")
        print(f"   Keywords: {', '.join(keywords[:10])}{'...' if len(keywords) > 10 else ''}")
        return course_name, keywords
        
    except Exception as e:
        print(f"⚠️  Gemini keyword generation failed: {e}")
        return _fallback_keywords(topic)


def _fallback_keywords(topic: Optional[str]) -> Tuple[str, List[str]]:
    """Fallback generic keywords when Gemini is unavailable."""
    course_name = topic.strip() if topic and topic.strip() else "Academic Lecture"
    generic_terms = [
        "definition", "theorem", "algorithm", "function",
        "variable", "equation", "analysis", "structure",
        "model", "system", "process", "method"
    ]
    print(f"ℹ️  Using fallback keywords for '{course_name}'")
    return course_name, generic_terms


# ============================================================
# INITIAL PROMPT BUILDER
# ============================================================

def build_initial_prompt(course_name: str, keywords: List[str]) -> str:
    """
    Build a Whisper initial prompt with domain-specific terms.
    
    The initial prompt helps Whisper recognize technical vocabulary by
    providing context about what kind of speech to expect.
    """
    terms_str = ", ".join(keywords)
    return (
        f"This is a {course_name} lecture. "
        f"Technical terms include: {terms_str}. "
        "The professor may reference equations, diagrams, and code."
    )


# ============================================================
# DYNAMIC HALLUCINATION LEAK PATTERNS
# ============================================================

def build_leak_patterns(course_name: str, keywords: List[str]) -> List[re.Pattern]:
    """
    Generate compiled regex patterns to catch Whisper leaking/rephrasing
    the initial prompt in the transcription output.
    
    Whisper sometimes echoes or paraphrases the initial prompt, especially
    at the start of a chunk or during silence. These patterns catch common
    reformulations.
    """
    # Escape for regex safety
    safe_name = re.escape(course_name)
    
    raw_patterns = [
        # Direct prompt leaks
        rf"this is a {safe_name} lecture",
        rf"^this is a .{{0,30}} lecture\b",
        r"technical terms include",
        r"the professor may reference",
        r"the speaker is discussing",
        r"this is a lecture transcription",
        r"this is a lecture on",
        r"^this is a lecture\b",
        r"lecture transcription\.\s*the speaker",
        # Topic-specific leak variations
        rf"we are discussing {safe_name}",
        rf"today's lecture is on {safe_name}",
        rf"this lecture covers {safe_name}",
        rf"the topic is {safe_name}",
    ]
    
    compiled = []
    for pattern in raw_patterns:
        try:
            compiled.append(re.compile(pattern, re.IGNORECASE))
        except re.error as e:
            print(f"⚠️  Failed to compile leak pattern '{pattern}': {e}")
    
    print(f"🛡️  Generated {len(compiled)} prompt-leak hallucination patterns for '{course_name}'")
    return compiled


def build_generic_leak_patterns() -> List[re.Pattern]:
    """
    Baseline leak patterns that are ALWAYS active, regardless of whether
    a topic was set. These catch Whisper echoing/rephrasing the default
    generic prompt.
    """
    raw_patterns = [
        r"the speaker is discussing academic topics",
        r"the speaker is discussing",
        r"this is a lecture transcription",
        r"this is a lecture on academic",
        r"^this is a lecture\b",
        r"lecture transcription\.\s*the speaker",
        r"discussing academic topics",
        r"technical terms include",
        r"the professor may reference",
        r"^this is a .{0,30} lecture\b",
    ]
    
    compiled = []
    for pattern in raw_patterns:
        try:
            compiled.append(re.compile(pattern, re.IGNORECASE))
        except re.error:
            pass
    
    return compiled

