import asyncio
from typing import List, Dict, Optional

# ... (imports)

class QAChatbot:
    # ... (init remains same)

    async def _search_web(self, query: str, max_results: int = 3) -> tuple[str, list]:
        """Search the web using Tavily and return summarized results and source metadata"""
        if not self.tavily_client:
            return "", []
        
        try:
            print(f"🔍 Searching web for: {query[:50]}...")
            
            # Run sync Tavily client in thread
            response = await asyncio.to_thread(
                self.tavily_client.search,
                query=query,
                search_depth="basic",
                max_results=max_results
            )
            
            # Extract and format search results
            formatted_results = []
            sources = []
            
            for result in response.get("results", []):
                title = result.get("title", "")
                url = result.get("url", "")
                content = result.get("content", "")[:300]  # Limit content length
                
                formatted_results.append(f"• {title}: {content}")
                sources.append({"title": title, "url": url})
            
            search_context = "\n".join(formatted_results)
            if search_context:
                print(f"✅ Found {len(formatted_results)} web results")
                
            return search_context, sources
            
        except Exception as e:
            print(f"❌ Web search error: {e}")
            return "", []
    
    async def ask(self, question: str, transcript: str, think_mode: bool = False) -> dict:
        """
        Ask a question about the transcript
        
        Args:
            question: User's question
            transcript: Current transcript text
            think_mode: If True, search web for additional context. If False, only use transcript.
            
        Returns:
            Dict containing 'answer' and optional 'sources'
        """
        if not self.available:
            return {"answer": "Gemini API is not available. Please check your GEMINI_API_KEY in .env file.", "sources": []}
        
        if not transcript or len(transcript.strip()) < 10:
            return {"answer": "I don't have enough transcript context yet. Please wait for more transcription or start speaking.", "sources": []}
        
        # If Think Mode is ON, search the web first
        web_context = ""
        sources = []
        
        if think_mode:
            web_context, sources = await self._search_web(question)
        
        # Create context-aware prompt
        prompt = self._create_prompt(question, transcript, think_mode, web_context)
        
        try:
            # Generate response asynchronously
            response = await self.model.generate_content_async(prompt)
            answer = response.text.strip()
            
            # Store in conversation history
            self.conversation_history.append({
                "question": question,
                "answer": answer
            })
            
            print(f"✅ Q&A: {question[:50]}... → {answer[:50]}...")
            return {
                "answer": answer,
                "sources": sources
            }
                
        except Exception as e:
            print(f"❌ Q&A error: {e}")
            return {"answer": f"Error generating answer: {str(e)}", "sources": []}
    
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
