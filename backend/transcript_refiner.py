from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
from datetime import datetime
import asyncio
import uvicorn
import hashlib
import re
import tempfile
from dotenv import load_dotenv
from groq import Groq
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi import Request

load_dotenv()
try:
    _groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
except:
    _groq_client = None

# Import database module (MongoDB)
import database_mongo as db

# ─────────────────────────────────────────────
# Transcript Chunking Utility
# ─────────────────────────────────────────────

def chunk_transcript(text: str, chunk_size: int = 3000, overlap: int = 200) -> list[str]:
    """
    Split transcript into overlapping chunks at sentence boundaries.
    Prevents context loss at chunk edges.
    """
    # Normalize whitespace
    text = ' '.join(text.split())
    
    # Split on sentence-ending punctuation
    import re
    sentences = re.split(r'(?<=[.?!])\s+', text)
    
    chunks = []
    current = ""

    for sentence in sentences:
        if len(current) + len(sentence) + 1 > chunk_size and current:
            chunks.append(current.strip())
            # Carry over the tail of the previous chunk for context continuity
            current = current[-overlap:] + " " + sentence
        else:
            current += (" " if current else "") + sentence

    if current.strip():
        chunks.append(current.strip())

    return chunks


# ─────────────────────────────────────────────
# Per-Chunk Refinement Prompt
# ─────────────────────────────────────────────

def build_refinement_prompt(chunk: str, chunk_index: int, total_chunks: int) -> str:
    return f"""You are a transcript corrector. This is chunk {chunk_index + 1} of {total_chunks} from a lecture transcript.

YOUR ONLY JOB: Fix ASR (speech recognition) errors. Do NOT summarize or compress.

STRICT RULES:
1. Fix mis-heard words, broken grammar, and garbled sentences
2. Remove ONLY immediate consecutive stutters (e.g. "the the the" → "the")
3. DO NOT remove content, merge ideas, or shorten the transcript
4. DO NOT add new information or explanations
5. Preserve ALL educational content exactly as spoken
6. Output length must be close to input length
7. Output ONLY the corrected transcript — no preamble, no commentary

EXAMPLES:
Input:  "the the physical layer layer handles transmission of raw bits"
Output: "the physical layer handles transmission of raw bits"

Input:  "TCP ensures ensure reliable delivery delivery of packets"
Output: "TCP ensures reliable delivery of packets"

Input:  "So basically basically the the idea is that routing tables are updated dynamically"
Output: "So basically the idea is that routing tables are updated dynamically"

Now correct this chunk:

{chunk}

CORRECTED TRANSCRIPT:"""


# ─────────────────────────────────────────────
# Main Refinement Function
# ─────────────────────────────────────────────

def refine_transcript(transcript: str, groq_client) -> tuple[str, bool]:
    """
    Refine transcript in chunks.
    Returns (refined_text, was_refined).
    Falls back to original on any failure or aggressive compression.
    """
    CHUNK_SIZE = 3000
    OVERLAP = 200
    MIN_RETENTION_RATIO = 0.75  # Refined output must be ≥75% of original length

    chunks = chunk_transcript(transcript, chunk_size=CHUNK_SIZE, overlap=OVERLAP)
    total = len(chunks)
    print(f"📦 Transcript split into {total} chunk(s) for refinement")

    refined_chunks = []

    for i, chunk in enumerate(chunks):
        try:
            prompt = build_refinement_prompt(chunk, i, total)

            completion = groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a precise ASR transcript corrector. Fix errors only. Never summarize."
                    },
                    {"role": "user", "content": prompt}
                ],
                model="moonshotai/kimi-k2-instruct-0905",
                temperature=0.1,  # Lower = more faithful, less creative drift
                max_tokens=1200
            )

            refined_chunk = completion.choices[0].message.content.strip()

            # Strip any LLM preamble that slipped through
            for prefix in [
                "CORRECTED TRANSCRIPT:", "Here is the corrected", "Here's the corrected",
                "Corrected transcript:", "Cleaned transcript:"
            ]:
                if refined_chunk.lower().startswith(prefix.lower()):
                    refined_chunk = refined_chunk[len(prefix):].strip()
                    break

            # Per-chunk length sanity check
            ratio = len(refined_chunk) / max(len(chunk), 1)
            if ratio < MIN_RETENTION_RATIO:
                print(f"⚠️  Chunk {i+1}: output too short ({ratio:.0%} of input) — using original chunk")
                refined_chunks.append(chunk)
            else:
                print(f"✅ Chunk {i+1}/{total} refined ({len(chunk)} → {len(refined_chunk)} chars)")
                refined_chunks.append(refined_chunk)

        except Exception as e:
            print(f"❌ Chunk {i+1} refinement failed: {e} — using original chunk")
            refined_chunks.append(chunk)  # Graceful fallback per chunk

    refined_transcript = " ".join(refined_chunks)

    # Final global length sanity check
    global_ratio = len(refined_transcript) / max(len(transcript), 1)
    if global_ratio < MIN_RETENTION_RATIO:
        print(f"⚠️  Global retention too low ({global_ratio:.0%}) — reverting to original transcript")
        return transcript, False

    return refined_transcript, True


