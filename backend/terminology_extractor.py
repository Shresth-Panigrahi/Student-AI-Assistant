"""
Terminology Extractor using LangChain + LangGraph
Extracts key terms from transcripts with definitions and context
"""
import os
import json
import re
from typing import TypedDict, Dict, Any, List
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

load_dotenv()


# ============================================================
# State Definition
# ============================================================
class TerminologyState(TypedDict):
    transcript: str
    raw_terms: str          # Raw LLM output (JSON string)
    terminologies: dict     # Parsed and structured terminologies
    error: str


# ============================================================
# Prompts
# ============================================================
EXTRACT_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a terminology extraction expert. Your task is to identify 
key technical terms, concepts, and acronyms from lecture transcripts.

RULES:
1. Extract at least 3-5 important technical terms, concepts, or acronyms
2. For each term, provide:
   - term: The exact term name
   - definition: A brief definition (1-2 sentences) based on the transcript
   - category: One of [concept, acronym, theory, method, tool, person, other]
   - importance: One of [high, medium, low]
3. Return ONLY a valid JSON array, no other text
4. Base definitions on what the transcript says, not external knowledge

OUTPUT FORMAT (JSON array only):
[
  {{"term": "OSI Model", "definition": "A 7-layer framework for network communication", "category": "concept", "importance": "high"}},
  {{"term": "TCP", "definition": "Transmission Control Protocol for reliable data transfer", "category": "acronym", "importance": "high"}}
]"""),
    ("human", "Extract key terms from this transcript:\n\n{transcript}\n\nJSON ARRAY:")
])

ENRICH_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a teaching assistant. Given a list of terms extracted from a lecture,
enrich each term's definition with additional context from the transcript.

For each term, check the transcript for:
- How it was explained by the speaker
- Any examples given
- How it relates to other mentioned terms

Return the enriched terms as a JSON array with the same format.
Keep definitions concise (2-3 sentences max).
Return ONLY the JSON array."""),
    ("human", """TERMS:
{terms}

ORIGINAL TRANSCRIPT:
{transcript}

Return the enriched JSON array:""")
])


# ============================================================
# Graph Nodes
# ============================================================
def extract_terms_node(state: TerminologyState) -> dict:
    """Extract raw terms from transcript"""
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0.2,
            google_api_key=os.getenv("GEMINI_API_KEY")
        )
        
        chain = EXTRACT_PROMPT | llm
        result = chain.invoke({"transcript": state["transcript"]})
        
        raw = result.content.strip()
        print(f"📝 Raw terms extracted: {raw[:200]}...")
        
        return {"raw_terms": raw, "error": ""}
        
    except Exception as e:
        print(f"❌ Term extraction error: {e}")
        return {"raw_terms": "", "error": str(e)}


def enrich_terms_node(state: TerminologyState) -> dict:
    """Enrich terms with transcript context"""
    if state.get("error"):
        return {}
    
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.2,
            google_api_key=os.getenv("GEMINI_API_KEY")
        )
        
        chain = ENRICH_PROMPT | llm
        result = chain.invoke({
            "terms": state["raw_terms"],
            "transcript": state["transcript"]
        })
        
        enriched_raw = result.content.strip()
        print(f"📝 Enriched terms: {enriched_raw[:200]}...")
        
        # Parse the enriched JSON
        terminologies = _parse_terms_json(enriched_raw)
        
        return {"terminologies": terminologies, "error": ""}
        
    except Exception as e:
        print(f"⚠️ Enrichment failed, falling back to raw terms: {e}")
        # Fallback: try to parse the raw terms
        terminologies = _parse_terms_json(state.get("raw_terms", ""))
        return {"terminologies": terminologies, "error": ""}


def _parse_terms_json(text: str) -> dict:
    """Parse terms JSON string into the structured dict format expected by frontend"""
    try:
        # Find JSON array in the text
        json_match = re.search(r'\[.*\]', text, re.DOTALL)
        if json_match:
            json_str = json_match.group()
        else:
            json_str = text
        
        # Clean markdown code blocks if present
        json_str = json_str.replace("```json", "").replace("```", "").strip()
        
        terms_list = json.loads(json_str)
        
        # Convert to the format expected by frontend/database
        terminologies = {}
        for idx, item in enumerate(terms_list):
            term_name = item.get("term", f"term_{idx}")
            term_key = term_name.lower().replace(" ", "_")
            
            terminologies[term_key] = {
                "original_term": term_name,
                "category": item.get("category", "concept"),
                "importance": item.get("importance", "medium"),
                "subject_area": "Lecture",
                "definition": item.get("definition", ""),
                "source": "langchain"
            }
        
        return terminologies
        
    except (json.JSONDecodeError, Exception) as e:
        print(f"❌ JSON parsing error: {e}")
        return {
            "parsing_error": {
                "original_term": "Parsing Error",
                "category": "error",
                "importance": "low",
                "subject_area": "System",
                "definition": "Key terms could not be parsed. Please try again.",
                "source": "fallback"
            }
        }


# ============================================================
# Build Graph
# ============================================================
def build_terminology_graph():
    """Build the LangGraph terminology extraction workflow"""
    graph = StateGraph(TerminologyState)
    
    graph.add_node("extract_terms", extract_terms_node)
    graph.add_node("enrich_terms", enrich_terms_node)
    
    graph.set_entry_point("extract_terms")
    graph.add_edge("extract_terms", "enrich_terms")
    graph.add_edge("enrich_terms", END)
    
    return graph.compile()


# Global compiled graph
_terminology_graph = None


def get_terminology_graph():
    """Get or create the terminology graph"""
    global _terminology_graph
    if _terminology_graph is None:
        _terminology_graph = build_terminology_graph()
    return _terminology_graph


# ============================================================
# Public API
# ============================================================
def extract_terminologies(transcript: str) -> dict:
    """
    Extract key terminologies from a transcript.
    
    Args:
        transcript: The lecture transcript text
        
    Returns:
        dict with 'terminologies' and 'error' keys
    """
    if not transcript or len(transcript.strip()) < 50:
        return {"terminologies": {}, "error": "Transcript too short to extract terminologies"}
    
    print(f"🔄 Extracting terminologies from transcript ({len(transcript)} chars)...")
    
    graph = get_terminology_graph()
    result = graph.invoke({
        "transcript": transcript,
        "raw_terms": "",
        "terminologies": {},
        "error": ""
    })
    
    print(f"✅ Extracted {len(result['terminologies'])} terminologies")
    
    return {
        "terminologies": result["terminologies"],
        "error": result["error"]
    }
