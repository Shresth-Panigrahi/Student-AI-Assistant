"""
Q&A Generator using LangChain + LangGraph
Generates quiz-style questions and answers from lecture transcripts
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
    qa_pairs: list          # List of {question, answer} dicts
    error: str


# ============================================================
# Prompt
# ============================================================
QA_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a quiz generator for educational content. 
Your task is to create practice questions from lecture transcripts.

RULES:
1. Generate exactly 5 questions based ONLY on the transcript content
2. Questions should test understanding, not just recall
3. Include a mix of:
   - Conceptual questions (What is...?, Explain...)
   - Application questions (How would...?, Why...?)
   - Comparison questions (What is the difference...?)
4. Answers should be concise but complete (1-3 sentences)
5. Return ONLY a valid JSON array, no other text

OUTPUT FORMAT (JSON array only):
[
  {{"question": "What is the primary purpose of the OSI model?", "answer": "The OSI model provides a 7-layer framework that standardizes network communication functions."}},
  {{"question": "How does the transport layer ensure reliable delivery?", "answer": "The transport layer uses TCP protocol with acknowledgments and retransmission."}}
]"""),
    ("human", "Generate 5 quiz questions from this transcript:\n\n{transcript}\n\nJSON ARRAY:")
])


# ============================================================
# Graph Nodes
# ============================================================
def generate_questions_node(state: QAGeneratorState) -> dict:
    """Generate Q&A pairs from transcript"""
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.4,
            google_api_key=os.getenv("GEMINI_API_KEY")
        )
        
        chain = QA_PROMPT | llm
        result = chain.invoke({"transcript": state["transcript"]})
        
        raw = result.content.strip()
        print(f"📝 Raw Q&A response: {raw[:300]}...")
        
        # Parse JSON
        qa_pairs = _parse_qa_json(raw)
        
        if len(qa_pairs) < 2:
            return {"qa_pairs": [], "error": "Could not generate enough questions. Please try again."}
        
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
        
        # Clean markdown code blocks
        json_str = json_str.replace("```json", "").replace("```", "").strip()
        
        qa_list = json.loads(json_str)
        
        # Validate structure
        valid_pairs = []
        for item in qa_list:
            if isinstance(item, dict) and "question" in item and "answer" in item:
                valid_pairs.append({
                    "question": item["question"].strip(),
                    "answer": item["answer"].strip()
                })
        
        return valid_pairs
        
    except (json.JSONDecodeError, Exception) as e:
        print(f"❌ JSON Q&A parsing error: {e}")
        # Fallback: try regex parsing (Q1: ... A1: ...)
        return _parse_qa_regex(text)


def _parse_qa_regex(text: str) -> list:
    """Fallback: parse Q&A from Q1:/A1: format"""
    qa_list = []
    lines = text.split('\n')
    current_q = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        q_match = re.match(r'^Q\d+[:\.]?\s*(.+)$', line, re.IGNORECASE)
        if q_match:
            current_q = q_match.group(1).strip()
            continue
        
        a_match = re.match(r'^A\d+[:\.]?\s*(.+)$', line, re.IGNORECASE)
        if a_match and current_q:
            current_a = a_match.group(1).strip()
            qa_list.append({"question": current_q, "answer": current_a})
            current_q = None
    
    return qa_list


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
