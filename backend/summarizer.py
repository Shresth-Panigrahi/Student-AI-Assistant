"""
Transcript Summarizer using LangChain + LangGraph
Generates structured lecture summaries from transcripts
"""
import os
from typing import TypedDict
from dotenv import load_dotenv

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

load_dotenv()


# ============================================================
# State Definition
# ============================================================
class SummarizerState(TypedDict):
    transcript: str
    summary: str
    error: str


# ============================================================
# Prompt
# ============================================================
SUMMARIZE_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an AI assistant integrated into a real-time lecture transcription system.
Your job is to summarize spoken transcripts into clean, readable summaries.

The summary should retain all key concepts, definitions, and sequence of explanation 
from the transcript, while removing filler phrases and repetition.

Output should be clear, concise, and suitable for students reviewing lecture notes.

CRITICAL FORMATTING RULES:
- DO NOT use markdown formatting (no **, ##, -, or *)
- DO NOT use asterisks or special characters for emphasis
- Use plain text only
- Structure with numbered sections and clear paragraphs
- Use line breaks to separate sections
- Write in complete sentences

CONTENT REQUIREMENTS:
- The tone is formal and educational
- Include clear topic headers (numbered: 1., 2., 3.)
- Add subpoints under each topic (use letters: a., b., c.)
- Do not omit definitions or examples mentioned in the transcript
- Keep summary length proportional to transcript size (around 20-25% of original)
- If the lecture is very short (under 50 words), provide a three-line summary
- Do not use external knowledge, only summarize what is in the transcript

EXAMPLE FORMAT:
1. Main Topic Name
The main topic discusses... [explanation in plain text]

a. First subtopic
Description of first subtopic in plain text.

b. Second subtopic
Description of second subtopic in plain text.

2. Second Main Topic
The second topic covers... [explanation]"""),
    ("human", "Generate a structured summary of this lecture transcript:\n\n{transcript}")
])


# ============================================================
# Graph Nodes
# ============================================================
def summarize_node(state: SummarizerState) -> dict:
    """Generate summary from transcript using Gemini via LangChain"""
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.3,
            google_api_key=os.getenv("GEMINI_API_KEY")
        )
        
        chain = SUMMARIZE_PROMPT | llm
        result = chain.invoke({"transcript": state["transcript"]})
        
        summary = result.content.strip()
        print(f"✅ Summary generated: {len(summary)} chars")
        
        return {"summary": summary, "error": ""}
        
    except Exception as e:
        print(f"❌ Summarization error: {e}")
        return {"summary": "", "error": str(e)}


# ============================================================
# Build Graph
# ============================================================
def build_summarizer_graph():
    """Build the LangGraph summarizer workflow"""
    graph = StateGraph(SummarizerState)
    
    graph.add_node("summarize", summarize_node)
    
    graph.set_entry_point("summarize")
    graph.add_edge("summarize", END)
    
    return graph.compile()


# Global compiled graph
_summarizer_graph = None


def get_summarizer_graph():
    """Get or create the summarizer graph"""
    global _summarizer_graph
    if _summarizer_graph is None:
        _summarizer_graph = build_summarizer_graph()
    return _summarizer_graph


# ============================================================
# Public API
# ============================================================
def summarize_transcript(transcript: str) -> dict:
    """
    Summarize a transcript.
    
    Args:
        transcript: The lecture transcript text
        
    Returns:
        dict with 'summary' and 'error' keys
    """
    if not transcript or len(transcript.strip()) < 10:
        return {"summary": "", "error": "Transcript too short to summarize"}
    
    print(f"🔄 Generating summary for transcript ({len(transcript)} chars)...")
    
    graph = get_summarizer_graph()
    result = graph.invoke({
        "transcript": transcript,
        "summary": "",
        "error": ""
    })
    
    return {
        "summary": result["summary"],
        "error": result["error"]
    }
