"""
Real-time Q&A Chatbot using Google Gemini API
Analyzes transcript and answers questions based on context
"""
import os
from groq import Groq
from typing import Optional, List, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class QAChatbot:
    """Q&A Chatbot that answers questions based on transcript context using Gemini"""
    
    def __init__(self, model_name: str = "moonshotai/kimi-k2-instruct-0905"):
        self.model_name = model_name
        self.conversation_history: List[Dict[str, str]] = []
        
        # Configure Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            print("⚠️  GROQ_API_KEY not found in environment variables")
            self.available = False
        else:
            try:
                self.client = Groq(api_key=api_key)
                self.available = True
                print(f"✅ Groq chatbot ready with model: {self.model_name}")
            except Exception as e:
                print(f"❌ Failed to configure Groq: {e}")
                self.available = False
    
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
            return "Groq API is not available. Please checking your GROQ_API_KEY in .env file."
        
        if not transcript or len(transcript.strip()) < 10:
            return "I don't have enough transcript context yet. Please wait for more transcription or start speaking."
        
        # Create context-aware prompt
        prompt = self._create_prompt(question, transcript, think_mode)
        
        try:
            # Generate response
            completion = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are a helpful AI assistant."},
                    {"role": "user", "content": prompt}
                ],
                model=self.model_name,
                temperature=0.3,
            )
            answer = completion.choices[0].message.content.strip()
            
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
    
    def _create_prompt(self, question: str, transcript: str, think_mode: bool = False) -> str:
        """Create a context-aware prompt for the AI"""
        
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
    """Check if Gemini is available (renamed logic but keeping function name for compatibility if needed, though we should update callers)"""
    # Note: We should update callers to use is_gemini_available or similar, 
    # but for now we map this to the chatbot availability to minimize friction
    chatbot = get_chatbot()
    return chatbot.available