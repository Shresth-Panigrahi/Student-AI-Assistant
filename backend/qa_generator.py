"""
Q&A Generator using LangChain + LangGraph
Generates exam-style questions with difficulty and type classifications.
"""
import os
import json
import re
from typing import TypedDict, List, Dict
from dotenv import load_dotenv

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

load_dotenv()

# ============================================================
# State Definition
# ============================================================
class QAGeneratorState(TypedDict):
    transcript: str
    context: str
    count: int
    qa_pairs: list          # List of {question, answer, difficulty, type} dicts
    error: str


# ============================================================
# Prompt — Exam-style questions with difficulty and type
# ============================================================
QA_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert professor generating exam-style questions for university students. Generate questions strictly from the provided lecture transcript. Every question must be answerable using only information in the transcript. Do not invent information."""),
    ("human", """Generate exactly {count} Q&A pairs from this lecture transcript. 

Rules:
- Questions must be exam-worthy: test understanding, not just recall
- Each answer must be 2 to 4 sentences, precise, complete, and self-contained
- Mix question types: some definitional ("What is X"), some explanatory ("Why does Y"), some comparative ("How does A differ from B"), some applied ("In what scenario would you use X")
- Do not generate yes/no questions
- Questions must be specific, not vague

Respond ONLY with valid JSON array, no markdown, no extra text:
[
  {{
    "question": "Full question here?",
    "answer": "Complete 2-4 sentence answer here.",
    "difficulty": "easy|medium|hard",
    "type": "definition|explanation|comparison|application"
  }}
]

Transcript:
{transcript}
{context}""")
])


# ============================================================
# Graph Nodes
# ============================================================
def generate_questions_node(state: QAGeneratorState) -> dict:
    """Generate Q&A pairs from transcript"""
    try:
        llm = ChatGroq(
            model="moonshotai/kimi-k2-instruct-0905",
            temperature=0.3,
            api_key=os.getenv("GROQ_API_KEY")
        )
        
        context_section = ""
        if state.get("context") and state["context"].strip():
            context_section = f"\nAdditional context:\n{state['context']}"
        
        count = state.get("count", 10)
        
        chain = QA_PROMPT | llm
        result = chain.invoke({
            "transcript": state["transcript"],
            "count": count,
            "context": context_section
        })
        
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
            if isinstance(item, dict) and "question" in item and "answer" in item:
                valid_pairs.append({
                    "question": item["question"].strip(),
                    "answer": item["answer"].strip(),
                    "difficulty": item.get("difficulty", "medium").strip().lower(),
                    "type": item.get("type", "explanation").strip().lower(),
                })
        
        return valid_pairs
        
    except (json.JSONDecodeError, Exception) as e:
        print(f"❌ JSON Q&A parsing error: {e}")
        return []


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
def generate_qa(transcript: str, context: str = "", count: int = 10) -> dict:
    """
    Generate Q&A pairs from a transcript.
    
    Args:
        transcript: The lecture transcript text
        context: Additional context from files
        count: Number of Q&A pairs to generate
        
    Returns:
        dict with 'qa_pairs' and 'error' keys
    """
    if not transcript or len(transcript.strip()) < 50:
        return {"qa_pairs": [], "error": "Transcript too short to generate Q&A"}
    
    print(f"🔄 Generating Q&A for transcript ({len(transcript)} chars)...")
    
    graph = get_qa_graph()
    result = graph.invoke({
        "transcript": transcript,
        "context": context,
        "count": count,
        "qa_pairs": [],
        "error": ""
    })
    
    return {
        "qa_pairs": result["qa_pairs"],
        "error": result["error"]
    }