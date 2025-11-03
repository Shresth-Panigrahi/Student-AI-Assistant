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
    
    def ask(self, question: str, transcript: str) -> str:
        """
        Ask a question about the transcript
        
        Args:
            question: User's question
            transcript: Current transcript text
            
        Returns:
            AI-generated answer based on transcript context
        """
        if not self.available:
            return "Ollama is not available. Please start Ollama with: ollama serve"
        
        if not transcript or len(transcript.strip()) < 10:
            return "I don't have enough transcript context yet. Please wait for more transcription or start speaking."
        
        # Create context-aware prompt
        prompt = self._create_prompt(question, transcript)
        
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
    
    def _create_prompt(self, question: str, transcript: str) -> str:
        """Create a context-aware prompt for the AI"""
        
        # Limit transcript length to avoid token limits
        max_transcript_length = 2000
        if len(transcript) > max_transcript_length:
            # Take the most recent part
            transcript = "..." + transcript[-max_transcript_length:]
        
        prompt = f"""You are an AI assistant helping a student understand a lecture. 

LECTURE TRANSCRIPT:
{transcript}

STUDENT'S QUESTION:
{question}

INSTRUCTIONS:
1. Answer the question based ONLY on the information in the transcript above
2. If the answer is in the transcript, provide a clear and concise response
3. If the information is NOT in the transcript, say: "I don't see that information in the current transcript yet."
4. Be helpful and educational
5. Keep your answer under 150 words

ANSWER:"""
        
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
