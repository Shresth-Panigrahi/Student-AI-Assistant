"""
Q&A Generator using LangChain + LangGraph
Generates Short and Long answer questions based on transcript depth.
"""
import os
import json
import re
from typing import TypedDict, List, Dict
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

load_dotenv()

# ============================================================
# State Definition
# ============================================================
class QAGeneratorState(TypedDict):
    transcript: str
    qa_pairs: list          # List of {type, question, answer} dicts
    error: str


# ============================================================
# Prompt (Modified for Content Depth Analysis)
# ============================================================
# We structure the prompt to act as a "Teacher" deciding the exam difficulty
QA_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert educational content generator. 
Your task is to create a quiz based on the provided lecture transcript.

ANALYSIS INSTRUCTIONS:
1. Analyze the transcript for depth and detail.
2. If the content is detailed/rich: Generate a mix of 'short_answer' and 'long_answer' questions.
3. If the content is superficial or brief: Stick strictly to 'short_answer' questions.

QUESTION TYPES:
- "short_answer": Recall-based or simple concept checks. Answer length: 1-2 sentences.
- "long_answer": Synthesis, explanation of processes, or 'how/why' scenarios. Answer length: 3-5 sentences.

RULES:
1. Generate between 5 to 7 questions total.
2. Ensure answers are strictly derived from the text provided.
3. Return ONLY a valid JSON array.

OUTPUT FORMAT (JSON array only):
[
  {{
    "type": "short_answer",
    "question": "What is the primary function of the CPU?", 
    "answer": "The CPU executes instructions and processes data."
  }},
  {{
    "type": "long_answer",
    "question": "Explain the fetch-decode-execute cycle.", 
    "answer": "First, the CPU fetches the instruction from memory. Next, the control unit decodes what the instruction means. Finally, the ALU executes the command and stores the result."
  }}
]"""),
    ("human", "Generate quiz questions based on this transcript:\n\n{transcript}\n\nJSON ARRAY:")
])


# ============================================================
# Graph Nodes
# ============================================================
def generate_questions_node(state: QAGeneratorState) -> dict:
    """Generate Q&A pairs from transcript"""
    try:
        # Using a slightly higher temperature to encourage better long-form synthesis
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.5, 
            google_api_key=os.getenv("GEMINI_API_KEY")
        )
        
        chain = QA_PROMPT | llm
        result = chain.invoke({"transcript": state["transcript"]})
        
        raw = result.content.strip()
        print(f"📝 Raw Q&A response: {raw[:300]}...")
        
        # Parse JSON
        qa_pairs = _parse_qa_json(raw)
        
        if len(qa_pairs) < 1:
            return {"qa_pairs": [], "error": "Could not generate questions. Transcript might be empty."}
        
        print(f"✅ Generated {len(qa_pairs)} Q&A pairs")
        return {"qa_pairs": qa_pairs, "error": ""}
        
    except Exception as e:
        print(f"❌ Q&A generation error: {e}")
        return {"qa_pairs": [], "error": str(e)}


def _parse_qa_json(text: str) -> list:
    """Parse Q&A JSON from LLM response"""
    try:
        # Try to find JSON array
        json_match = re.search(r'\[.*\]', text, re.DOTALL)
        if json_match:
            json_str = json_match.group()
        else:
            json_str = text
        
        # Clean markdown code blocks if present
        json_str = json_str.replace("```json", "").replace("```", "").strip()
        
        qa_list = json.loads(json_str)
        
        # Validate structure
        valid_pairs = []
        for item in qa_list:
            # We now check for 'type' as well, defaulting to 'short_answer' if missing
            if isinstance(item, dict) and "question" in item and "answer" in item:
                valid_pairs.append({
                    "type": item.get("type", "short_answer"),
                    "question": item["question"].strip(),
                    "answer": item["answer"].strip()
                })
        
        return valid_pairs
        
    except (json.JSONDecodeError, Exception) as e:
        print(f"❌ JSON Q&A parsing error: {e}")
        return [] # Return empty on failure for safety


# ============================================================
# Build Graph
# ============================================================
def build_qa_graph():
    """Build the LangGraph Q&A generator workflow"""
    graph = StateGraph(QAGeneratorState)
    
    graph.add_node("generate_questions", generate_questions_node)
    
    graph.set_entry_point("generate_questions")
    graph.add_edge("generate_questions", END)
    
    return graph.compile()


# Global compiled graph
_qa_graph = None


def get_qa_graph():
    """Get or create the Q&A graph"""
    global _qa_graph
    if _qa_graph is None:
        _qa_graph = build_qa_graph()
    return _qa_graph


# ============================================================
# Public API
# ============================================================
def generate_qa(transcript: str) -> dict:
    """
    Generate Q&A pairs from a transcript.
    
    Args:
        transcript: The lecture transcript text
        
    Returns:
        dict with 'qa_pairs' and 'error' keys
    """
    if not transcript or len(transcript.strip()) < 50:
        return {"qa_pairs": [], "error": "Transcript too short to generate Q&A"}
    
    print(f"🔄 Generating Q&A for transcript ({len(transcript)} chars)...")
    
    graph = get_qa_graph()
    result = graph.invoke({
        "transcript": transcript,
        "qa_pairs": [],
        "error": ""
    })
    
    return {
        "qa_pairs": result["qa_pairs"],
        "error": result["error"]
    }