"""
Real-time Q&A Chatbot using Ollama
Analyzes transcript and answers questions based on context
"""
import requests
import json
from typing import Optional, List, Dict

class QAChatbot:
    """Q&A Chatbot that answers questions based on transcript context"""
    
    def __init__(self, model: str = "llama3.2:1b", ollama_url: str = "http://localhost:11434"):
        self.model = model
        self.ollama_url = ollama_url
        self.conversation_history: List[Dict[str, str]] = []
        
        # Check if Ollama is available
        self.available = self._check_ollama()
        if self.available:
            print(f"✅ Ollama chatbot ready with model: {self.model}")
        else:
            print(f"⚠️  Ollama not available at {self.ollama_url}")
    
    def _check_ollama(self) -> bool:
        """Check if Ollama is running"""
        try:
            response = requests.get(f"{self.ollama_url}/api/tags", timeout=2)
            return response.status_code == 200
        except:
            return False
    
    def ask(self, question: str, transcript: str, think_mode: bool = False) -> str:
        """
        Ask a question about the transcript
        
        Args:
            question: User's question
            transcript: Current transcript text
            think_mode: If True, use AI's knowledge. If False, only use transcript.
            
        Returns:
            AI-generated answer based on transcript context
        """
        if not self.available:
            return "Ollama is not available. Please start Ollama with: ollama serve"
        
        if not transcript or len(transcript.strip()) < 10:
            return "I don't have enough transcript context yet. Please wait for more transcription or start speaking."
        
        # Create context-aware prompt
        prompt = self._create_prompt(question, transcript, think_mode)
        
        try:
            # Call Ollama API
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "top_p": 0.9,
                        "max_tokens": 500
                    }
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                answer = result.get("response", "").strip()
                
                # Store in conversation history
                self.conversation_history.append({
                    "question": question,
                    "answer": answer
                })
                
                print(f"✅ Q&A: {question[:50]}... → {answer[:50]}...")
                return answer
            else:
                return f"Error: Ollama returned status {response.status_code}"
                
        except requests.exceptions.Timeout:
            return "Request timed out. The model might be processing. Please try again."
        except Exception as e:
            print(f"❌ Q&A error: {e}")
            return f"Error generating answer: {str(e)}"
    
    def _create_prompt(self, question: str, transcript: str, think_mode: bool = False) -> str:
        """Create a context-aware prompt for the AI"""
        
        # Limit transcript length to avoid token limits
        max_transcript_length = 2000
        if len(transcript) > max_transcript_length:
            # Take the most recent part
            transcript = "..." + transcript[-max_transcript_length:]
        
        if think_mode:
            # Think mode: Use AI's knowledge + transcript
            prompt = f"""You are an AI assistant helping a student understand a lecture.

LECTURE TRANSCRIPT:
{transcript}

STUDENT'S QUESTION:
{question}

INSTRUCTIONS:
1. First, check if the answer is in the transcript
2. If yes, answer based on the transcript
3. If no, use your own knowledge to provide a helpful explanation
4. Relate your answer to the lecture topic when possible
5. Be clear, educational, and concise (under 200 words)

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

Example:
- Transcript: "Today we are learning about the OSI reference model"
- Question: "What are we learning today?"
- Answer: "We are learning about the OSI reference model."

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
    """Check if Ollama is available"""
    chatbot = get_chatbot()
    return chatbot.available
