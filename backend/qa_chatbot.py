"""
Real-time Q&A Chatbot using Google Gemini API
Analyzes transcript and answers questions based on context
Think Mode: Uses Tavily web search for additional context
"""
import os
import google.generativeai as genai
from typing import Optional, List, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Try to import Tavily
try:
    from tavily import TavilyClient
    TAVILY_AVAILABLE = True
except ImportError:
    TAVILY_AVAILABLE = False
    print("⚠️  Tavily not installed. Think Mode will use Gemini's knowledge only.")


class QAChatbot:
    """Q&A Chatbot that answers questions based on transcript context using Gemini"""
    
    def __init__(self, model_name: str = "gemini-2.5-flash"):
        self.model_name = model_name
        self.conversation_history: List[Dict[str, str]] = []
        self.tavily_client = None
        
        # Configure Gemini
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("⚠️  GEMINI_API_KEY not found in environment variables")
            self.available = False
        else:
            try:
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel(self.model_name)
                self.available = True
                print(f"✅ Gemini chatbot ready with model: {self.model_name}")
            except Exception as e:
                print(f"❌ Failed to configure Gemini: {e}")
                self.available = False
        
        # Configure Tavily for Think Mode
        tavily_key = os.getenv("TAVILY_API_KEY")
        if TAVILY_AVAILABLE and tavily_key:
            try:
                self.tavily_client = TavilyClient(api_key=tavily_key)
                print("✅ Tavily web search ready for Think Mode")
            except Exception as e:
                print(f"⚠️  Failed to configure Tavily: {e}")
                self.tavily_client = None
        elif not tavily_key:
            print("⚠️  TAVILY_API_KEY not found. Think Mode will use Gemini's knowledge only.")
    
    def _search_web(self, query: str, max_results: int = 3) -> str:
        """Search the web using Tavily and return summarized results"""
        if not self.tavily_client:
            return ""
        
        try:
            print(f"🔍 Searching web for: {query[:50]}...")
            response = self.tavily_client.search(
                query=query,
                search_depth="basic",
                max_results=max_results
            )
            
            # Extract and format search results
            results = []
            for result in response.get("results", []):
                title = result.get("title", "")
                content = result.get("content", "")[:300]  # Limit content length
                results.append(f"• {title}: {content}")
            
            if results:
                search_context = "\n".join(results)
                print(f"✅ Found {len(results)} web results")
                return search_context
            
            return ""
        except Exception as e:
            print(f"❌ Web search error: {e}")
            return ""
    
    def ask(self, question: str, transcript: str, think_mode: bool = False) -> str:
        """
        Ask a question about the transcript
        
        Args:
            question: User's question
            transcript: Current transcript text
            think_mode: If True, search web for additional context. If False, only use transcript.
            
        Returns:
            AI-generated answer based on transcript context
        """
        if not self.available:
            return "Gemini API is not available. Please check your GEMINI_API_KEY in .env file."
        
        if not transcript or len(transcript.strip()) < 10:
            return "I don't have enough transcript context yet. Please wait for more transcription or start speaking."
        
        # If Think Mode is ON, search the web first
        web_context = ""
        if think_mode:
            web_context = self._search_web(question)
        
        # Create context-aware prompt
        prompt = self._create_prompt(question, transcript, think_mode, web_context)
        
        try:
            # Generate response
            response = self.model.generate_content(prompt)
            answer = response.text.strip()
            
            # Store in conversation history
            self.conversation_history.append({
                "question": question,
                "answer": answer
            })
            
            print(f"✅ Q&A: {question[:50]}... → {answer[:50]}...")
            return answer
                
        except Exception as e:
            print(f"❌ Q&A error: {e}")
            return f"Error generating answer: {str(e)}"
    
    def _create_prompt(self, question: str, transcript: str, think_mode: bool = False, web_context: str = "") -> str:
        """Create a context-aware prompt for the AI"""
        
        if think_mode:
            # Think mode: Use web search results + transcript
            if web_context:
                prompt = f"""You are an AI assistant helping a student understand a lecture.

LECTURE TRANSCRIPT:
{transcript}

WEB SEARCH RESULTS (for additional context):
{web_context}

STUDENT'S QUESTION:
{question}

INSTRUCTIONS:
1. First, check if the answer is in the transcript
2. Use the web search results to provide additional explanation and context
3. Synthesize information from both sources
4. Keep your answer concise: 3-4 sentences maximum
5. Be educational and helpful

ANSWER:"""
            else:
                # Fallback if no web results (use Gemini's knowledge)
                prompt = f"""You are an AI assistant helping a student understand a lecture.

LECTURE TRANSCRIPT:
{transcript}

STUDENT'S QUESTION:
{question}

INSTRUCTIONS:
1. First, check if the answer is in the transcript
2. If the transcript doesn't fully answer, use your knowledge to explain
3. Keep your answer concise: 3-4 sentences maximum
4. Be educational and helpful

ANSWER:"""
        else:
            # Default mode: ONLY use transcript - STRICT
            prompt = f"""You are a transcript reader. Your ONLY job is to find answers in the transcript.

LECTURE TRANSCRIPT:
{transcript}

STUDENT'S QUESTION:
{question}

STRICT RULES:
1. Read the transcript carefully
2. Find the EXACT answer to the question in the transcript
3. Quote or paraphrase ONLY what is said in the transcript
4. DO NOT add any information not in the transcript
5. DO NOT make assumptions or inferences
6. If the answer is not explicitly in the transcript, say: "That information is not in the transcript yet."

Now answer the question using ONLY the transcript above:"""
        
        return prompt
    
    def reset(self):
        """Reset conversation history"""
        self.conversation_history = []
        print("🔄 Conversation history reset")
    
    def get_history(self) -> List[Dict[str, str]]:
        """Get conversation history"""
        return self.conversation_history


# Global chatbot instance
_chatbot: Optional[QAChatbot] = None

def get_chatbot() -> QAChatbot:
    """Get or create chatbot instance"""
    global _chatbot
    if _chatbot is None:
        _chatbot = QAChatbot()
    return _chatbot

def is_ollama_available() -> bool:
    """Check if Gemini is available"""
    chatbot = get_chatbot()
    return chatbot.available
