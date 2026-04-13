"""
Contextual RAG Pipeline for Q&A
Uses Anthropic's Contextual Retrieval approach:
- Chunk transcript with overlapping windows
- Enrich each chunk with a contextual sentence via Groq
- Embed with sentence-transformers (all-MiniLM-L6-v2, free, local)
- Store in ChromaDB (persistent local vector DB, one collection per session)
- Retrieve top-k relevant chunks for each question
"""
import os
import asyncio
import traceback
from typing import List, Dict, Optional
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

# ─── Constants ───────────────────────────────────────────────────
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
CHUNK_SIZE = 1200           # characters (~300 tokens at 4 chars/token)
CHUNK_OVERLAP = 240         # overlap to preserve boundary context
TOP_K_CHUNKS = 4            # chunks retrieved per query
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai", "chroma_db")
GROQ_CONCURRENCY_LIMIT = 5  # max concurrent Groq calls for enrichment


class RAGPipeline:
    """
    Contextual RAG pipeline:
    - index_session: chunk → enrich → embed → store
    - retrieve: embed query → search ChromaDB → return top-k
    - delete_session_index: remove ChromaDB collection
    """

    def __init__(self):
        self._model = None
        self._chroma_client = None

        # Initialize Groq client
        api_key = os.getenv("GROQ_API_KEY")
        if api_key:
            try:
                self._groq_client = Groq(api_key=api_key)
                print("✅ RAG Pipeline: Groq client ready")
            except Exception as e:
                print(f"❌ RAG Pipeline: Groq init failed: {e}")
                self._groq_client = None
        else:
            print("⚠️  RAG Pipeline: GROQ_API_KEY not set")
            self._groq_client = None

    # ─── Lazy-loaded properties ──────────────────────────────────

    @property
    def model(self):
        """Lazy-load sentence-transformer model (downloads ~80MB on first run)."""
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                print(f"📦 Loading embedding model: {EMBEDDING_MODEL_NAME}...")
                self._model = SentenceTransformer(EMBEDDING_MODEL_NAME)
                print(f"✅ Embedding model loaded: {EMBEDDING_MODEL_NAME}")
            except Exception as e:
                print(f"❌ Failed to load embedding model: {e}")
                traceback.print_exc()
                self._model = None
        return self._model

    @property
    def chroma_client(self):
        """Lazy-load ChromaDB persistent client."""
        if self._chroma_client is None:
            try:
                import chromadb
                os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
                self._chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
                print(f"✅ ChromaDB client ready at: {CHROMA_PERSIST_DIR}")
            except Exception as e:
                print(f"❌ Failed to init ChromaDB: {e}")
                traceback.print_exc()
                self._chroma_client = None
        return self._chroma_client

    # ─── Index a session ─────────────────────────────────────────

    async def index_session(
        self, session_id: str, transcript: str, session_title: str,
        force_reindex: bool = False
    ) -> dict:
        """
        Build the RAG index for a session. Idempotent — skips if already indexed.
        If force_reindex=True, deletes old collection first (used after transcript enhancement).

        Steps:
        1. Chunk the transcript
        2. Enrich each chunk with a contextual sentence via Groq
        3. Embed enriched documents
        4. Store in ChromaDB
        """
        if not transcript or len(transcript.strip()) < 50:
            return {"indexed": False, "chunk_count": 0, "session_id": session_id,
                    "error": "Transcript too short"}

        if not self.model or not self.chroma_client:
            return {"indexed": False, "chunk_count": 0, "session_id": session_id,
                    "error": "Model or ChromaDB not available"}

        # Force reindex: delete old collection to prevent duplicate embeddings
        if force_reindex:
            try:
                await asyncio.to_thread(
                    lambda: self.chroma_client.delete_collection(f"session_{session_id}")
                )
                print(f"🔄 RAG: Deleted old index for session {session_id} (force reindex)")
            except Exception:
                pass  # collection may not exist yet

        # Check if already indexed (idempotent) — skip check if force_reindex
        if not force_reindex:
            try:
                existing = await asyncio.to_thread(
                    lambda: self.chroma_client.get_collection(f"session_{session_id}")
                )
                count = await asyncio.to_thread(lambda: existing.count())
                if count > 0:
                    print(f"✅ RAG: Session {session_id} already indexed ({count} chunks)")
                    return {"indexed": True, "chunk_count": count, "session_id": session_id}
            except Exception:
                pass  # Collection doesn't exist yet, proceed to create

        print(f"🔄 RAG: Indexing session {session_id} ({len(transcript)} chars)...")

        # Step 1 — Chunk the transcript
        try:
            from langchain_text_splitters import RecursiveCharacterTextSplitter
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=CHUNK_SIZE,
                chunk_overlap=CHUNK_OVERLAP,
                separators=["\n\n", "\n", ". ", " "]
            )
            chunks = splitter.split_text(transcript)
            print(f"  ✅ Split into {len(chunks)} chunks")
        except Exception as e:
            print(f"  ❌ Chunking failed: {e}")
            return {"indexed": False, "chunk_count": 0, "session_id": session_id,
                    "error": f"Chunking failed: {str(e)}"}

        if not chunks:
            return {"indexed": False, "chunk_count": 0, "session_id": session_id,
                    "error": "No chunks produced"}

        # Step 2 — Contextual enrichment via Groq
        context_sentences = await self._enrich_chunks(chunks, session_title)
        print(f"  ✅ Generated {sum(1 for c in context_sentences if c)} context sentences")

        # Step 3 — Build enriched documents
        enriched_docs = []
        for i, chunk_text in enumerate(chunks):
            ctx = context_sentences[i] if i < len(context_sentences) else ""
            if ctx:
                enriched = f"Context: {ctx}\n\nContent: {chunk_text}"
            else:
                enriched = f"Content: {chunk_text}"
            enriched_docs.append(enriched)

        # Step 4 — Generate embeddings
        try:
            embeddings = await asyncio.to_thread(
                lambda: self.model.encode(enriched_docs, batch_size=32, show_progress_bar=False)
            )
            print(f"  ✅ Generated {len(embeddings)} embeddings")
        except Exception as e:
            print(f"  ❌ Embedding failed: {e}")
            return {"indexed": False, "chunk_count": 0, "session_id": session_id,
                    "error": f"Embedding failed: {str(e)}"}

        # Step 5 — Store in ChromaDB (cosine distance for normalized embeddings)
        try:
            collection = await asyncio.to_thread(
                lambda: self.chroma_client.get_or_create_collection(
                    name=f"session_{session_id}",
                    metadata={"hnsw:space": "cosine"}
                )
            )

            ids = [f"{session_id}_chunk_{i}" for i in range(len(chunks))]
            embedding_lists = [emb.tolist() for emb in embeddings]
            metadatas = [
                {
                    "chunk_index": i,
                    "session_id": session_id,
                    "original_text": chunk_text
                }
                for i, chunk_text in enumerate(chunks)
            ]

            await asyncio.to_thread(
                lambda: collection.add(
                    ids=ids,
                    embeddings=embedding_lists,
                    documents=enriched_docs,
                    metadatas=metadatas
                )
            )
            print(f"  ✅ Stored {len(chunks)} chunks in ChromaDB")

        except Exception as e:
            print(f"  ❌ ChromaDB storage failed: {e}")
            traceback.print_exc()
            return {"indexed": False, "chunk_count": 0, "session_id": session_id,
                    "error": f"Storage failed: {str(e)}"}

        print(f"✅ RAG: Session {session_id} indexed successfully ({len(chunks)} chunks)")
        return {"indexed": True, "chunk_count": len(chunks), "session_id": session_id}

    # ─── Retrieve relevant chunks ────────────────────────────────

    async def retrieve(self, session_id: str, question: str) -> List[Dict]:
        """
        Retrieve the top-k most relevant chunks for a given question.
        Returns list of dicts with text, relevance_score, chunk_index.
        """
        if not self.model or not self.chroma_client:
            return []

        # Embed the question
        try:
            question_embedding = await asyncio.to_thread(
                lambda: self.model.encode(question)
            )
        except Exception as e:
            print(f"❌ RAG retrieve: Question embedding failed: {e}")
            return []

        # Get ChromaDB collection
        try:
            collection = await asyncio.to_thread(
                lambda: self.chroma_client.get_collection(f"session_{session_id}")
            )
            count = await asyncio.to_thread(lambda: collection.count())
            print(f"🔍 RAG retrieve: Collection session_{session_id} has {count} chunks")
            if count == 0:
                return []
        except Exception as e:
            print(f"⚠️  RAG retrieve: Collection not found for session_{session_id}: {e}")
            return []  # Collection doesn't exist

        # Query
        try:
            results = await asyncio.to_thread(
                lambda: collection.query(
                    query_embeddings=[question_embedding.tolist()],
                    n_results=TOP_K_CHUNKS,
                    include=["documents", "metadatas", "distances"]
                )
            )
        except Exception as e:
            print(f"❌ RAG retrieve: Query failed: {e}")
            return []

        # Parse results
        # ChromaDB cosine distance is in [0, 2]. Convert to similarity: 1 - (distance / 2) → [0, 1]
        retrieved = []
        if results and results.get("ids") and results["ids"][0]:
            for i in range(len(results["ids"][0])):
                distance = results["distances"][0][i] if results.get("distances") else 2.0
                # Cosine distance → cosine similarity: similarity = 1 - (distance / 2)
                relevance_score = max(0.0, 1.0 - (distance / 2.0))
                metadata = results["metadatas"][0][i] if results.get("metadatas") else {}

                print(f"  📊 Chunk {i}: distance={distance:.4f}, relevance={relevance_score:.4f}")

                # Filter out low-relevance chunks (0.25 on a 0-1 scale)
                if relevance_score < 0.25:
                    print(f"  ⏭️  Skipping chunk {i}: relevance {relevance_score:.4f} < 0.25")
                    continue

                retrieved.append({
                    "text": metadata.get("original_text", results["documents"][0][i]),
                    "relevance_score": relevance_score,
                    "chunk_index": metadata.get("chunk_index", i)
                })

        print(f"🔍 RAG retrieve: {len(retrieved)} chunks passed relevance filter")

        # Sort by relevance descending
        retrieved.sort(key=lambda x: x["relevance_score"], reverse=True)
        return retrieved

    # ─── Delete session index ────────────────────────────────────

    async def delete_session_index(self, session_id: str) -> bool:
        """Delete the ChromaDB collection for a session."""
        if not self.chroma_client:
            return False

        try:
            await asyncio.to_thread(
                lambda: self.chroma_client.delete_collection(f"session_{session_id}")
            )
            print(f"✅ RAG: Deleted index for session {session_id}")
            return True
        except Exception as e:
            print(f"⚠️  RAG: Collection for {session_id} not found or delete failed: {e}")
            return False

    # ─── Get index status ────────────────────────────────────────

    async def get_index_status(self, session_id: str) -> dict:
        """Check if a session has been RAG-indexed."""
        if not self.chroma_client:
            return {"indexed": False, "chunk_count": 0, "session_id": session_id}

        try:
            collection = await asyncio.to_thread(
                lambda: self.chroma_client.get_collection(f"session_{session_id}")
            )
            count = await asyncio.to_thread(lambda: collection.count())
            return {"indexed": count > 0, "chunk_count": count, "session_id": session_id}
        except Exception:
            return {"indexed": False, "chunk_count": 0, "session_id": session_id}

    # ─── Private: Contextual enrichment ──────────────────────────

    async def _enrich_chunks(self, chunks: List[str], session_title: str) -> List[str]:
        """
        For each chunk, call Groq to generate one contextual sentence.
        Uses a semaphore to limit concurrency and avoid rate limiting.
        """
        if not self._groq_client:
            return [""] * len(chunks)

        semaphore = asyncio.Semaphore(GROQ_CONCURRENCY_LIMIT)

        async def enrich_one(chunk_text: str) -> str:
            async with semaphore:
                try:
                    result = await asyncio.to_thread(
                        lambda: self._groq_client.chat.completions.create(
                            messages=[
                                {
                                    "role": "system",
                                    "content": (
                                        "You are a precise academic assistant. Given a lecture transcript "
                                        "excerpt and the lecture title, write exactly ONE sentence "
                                        "(maximum 25 words) describing what concept or topic this specific "
                                        "excerpt is about. Be specific, not generic."
                                    )
                                },
                                {
                                    "role": "user",
                                    "content": (
                                        f"Lecture title: {session_title}\n"
                                        f"Excerpt: {chunk_text}\n\n"
                                        "Write one sentence describing what this excerpt covers. "
                                        "Do not start with \"This excerpt\" — start with the concept name directly."
                                    )
                                }
                            ],
                            model="moonshotai/kimi-k2-instruct-0905",
                            temperature=0.2,
                            max_tokens=60
                        )
                    )
                    return result.choices[0].message.content.strip()
                except Exception as e:
                    print(f"  ⚠️  Enrichment failed for chunk: {e}")
                    return ""

        tasks = [enrich_one(chunk) for chunk in chunks]
        results = await asyncio.gather(*tasks)
        return list(results)


# ─── Module-level singleton ──────────────────────────────────────
# The embedding model is loaded once when first accessed and reused.
rag_pipeline = RAGPipeline()
