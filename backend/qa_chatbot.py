"""
Real-time Q&A Chatbot using Groq API
Analyzes transcript and answers questions based on context.
Supports both direct transcript mode (live recording) and RAG mode (saved sessions).
"""
import os
import asyncio
from groq import Groq
from typing import Optional, List, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class QAChatbot:
    """Q&A Chatbot that answers questions based on transcript context using Groq"""

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
        Ask a question about the transcript (original method for live recording Q&A).

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

    async def ask_with_rag(
        self,
        question: str,
        session_id: str,
        transcript: str,
        session_title: str,
        think_mode: bool = False
    ) -> dict:
        """
        RAG-powered Q&A for saved sessions. Retrieves relevant chunks
        from ChromaDB and generates precise answers.

        Returns:
            dict with: answer, sources, rag_used, think_mode
        """
        if not self.available:
            return {
                "answer": "Groq API is not available. Please check your GROQ_API_KEY in .env file.",
                "sources": [],
                "rag_used": False,
                "think_mode": think_mode
            }

        # Import RAG pipeline
        from rag_pipeline import rag_pipeline

        # Step 1 — Retrieve relevant chunks via RAG
        retrieved_chunks = await rag_pipeline.retrieve(session_id, question)

        rag_used = len(retrieved_chunks) > 0

        # Step 2 — Fallback if no chunks found
        if not retrieved_chunks:
            print(f"⚠️  RAG fallback: No relevant chunks found for session {session_id}")
            # Use first 3000 chars of transcript as context
            fallback_context = transcript[:3000] if transcript else ""
            if not fallback_context or len(fallback_context.strip()) < 10:
                return {
                    "answer": "Not enough transcript context available to answer this question.",
                    "sources": [],
                    "rag_used": False,
                    "think_mode": think_mode
                }

            rag_context = fallback_context
        else:
            # Step 3 — Build context string from retrieved chunks
            context_parts = []
            for i, chunk in enumerate(retrieved_chunks):
                context_parts.append(f"[Source {i + 1}] {chunk['text']}")
            rag_context = "\n\n---\n\n".join(context_parts)

        # Step 4/5 — Build system prompt
        if think_mode:
            system_prompt = (
                f'You are an expert academic assistant for the lecture "{session_title}".\n'
                "The student has enabled Think Mode — you may use your knowledge to supplement the lecture content.\n"
                "Prioritize information from the lecture sources below, but expand with your knowledge where helpful.\n"
                "Clearly distinguish between what the lecture says and what you are adding from general knowledge.\n"
                "Cite lecture sources used in format: (Sources: 1, 2)\n\n"
                f"Lecture Sources:\n{rag_context}"
            )
        else:
            system_prompt = (
                f'You are an expert academic assistant for the lecture "{session_title}".\n'
                "Answer the student's question using ONLY the provided lecture excerpt sources below.\n"
                'If the answer cannot be found in the provided sources, say exactly: '
                '"This topic wasn\'t covered in the relevant sections of the lecture."\n'
                "Be precise and cite which source number(s) you used at the end of your answer "
                "in format: (Sources: 1, 3)\n\n"
                f"Lecture Sources:\n{rag_context}"
            )

        # Step 6 — Call Groq
        try:
            result = await asyncio.to_thread(
                lambda: self.client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": question}
                    ],
                    model=self.model_name,
                    temperature=0.3,
                )
            )
            answer = result.choices[0].message.content.strip()

            # Store in conversation history
            self.conversation_history.append({
                "question": question,
                "answer": answer
            })

            print(f"✅ RAG Q&A: {question[:50]}... → {answer[:50]}...")

            # Build source citations
            sources = [
                {
                    "text": c["text"][:200] + "..." if len(c["text"]) > 200 else c["text"],
                    "relevance": round(c["relevance_score"], 2)
                }
                for c in retrieved_chunks
            ]

            return {
                "answer": answer,
                "sources": sources,
                "rag_used": rag_used,
                "think_mode": think_mode
            }

        except Exception as e:
            print(f"❌ RAG Q&A error: {e}")
            return {
                "answer": f"Error generating answer: {str(e)}",
                "sources": [],
                "rag_used": False,
                "think_mode": think_mode
            }

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