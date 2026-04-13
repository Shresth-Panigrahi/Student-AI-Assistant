"""
Upload Processor — Standalone pipeline for uploaded recording → full session.

This is a DIFFERENT feature from recording_enhancer.py.
recording_enhancer.py takes an existing live transcript and enhances it.
This module creates a brand new session entirely from an uploaded file.

Pipeline stages:
1. converting   — FFmpeg converts to mono 16kHz WAV
2. transcribing — transcribe_enhanced.py transcribes with high quality
3. refining     — Groq cleans up spoken-word artifacts
4. indexing     — RAG pipeline indexes the transcript
5. complete     — Session updated, ready for use
"""

import os
import asyncio
import traceback
from typing import Optional, List
from datetime import datetime

from groq import Groq
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "moonshotai/kimi-k2-instruct-0905"


def _refine_upload_transcript(raw_transcript: str, session_title: str, topic: str = "") -> str:
    """
    Groq refinement pass unique to the upload pipeline.
    More aggressive than live transcript refinement because there is no second
    source to compare against — this is the only transcript we have.

    Cleans up:
    - Incomplete sentences / false starts
    - Filler words (um, uh, you know, like)
    - Repetitive stutters
    - Run-on sentences without punctuation
    - Technical term normalization
    """
    if not GROQ_API_KEY:
        print("⚠️  No Groq API key — skipping upload transcript refinement")
        return raw_transcript

    if len(raw_transcript.strip()) < 100:
        return raw_transcript

    groq_client = Groq(api_key=GROQ_API_KEY)

    # Chunk the transcript for processing (3000 chars per chunk)
    chunks = []
    words = raw_transcript.split()
    current_chunk = ""
    for word in words:
        if len(current_chunk) + len(word) + 1 > 3000 and current_chunk:
            chunks.append(current_chunk)
            current_chunk = word
        else:
            current_chunk = (current_chunk + " " + word).strip() if current_chunk else word
    if current_chunk:
        chunks.append(current_chunk)

    topic_context = f"\nLecture topic: {topic}" if topic else ""

    system_prompt = (
        "You are a professional lecture transcript editor. You receive raw speech-to-text "
        "output from a lecture recording and must clean it into readable, well-structured text.\n\n"
        "RULES:\n"
        "1. Remove filler words: um, uh, you know, like (when used as filler), so basically, right\n"
        "2. Fix incomplete sentences and false starts — merge them into the intended sentence\n"
        "3. Remove immediate stutters and word repetitions\n"
        "4. Add proper punctuation and sentence boundaries\n"
        "5. Fix obvious speech recognition errors in technical terms\n"
        "6. Do NOT remove any educational content or change the meaning\n"
        "7. Do NOT summarize — every piece of information must be preserved\n"
        "8. Do NOT add information not present in the original\n"
        "9. Preserve the lecturer's voice and teaching style\n"
        "10. Output ONLY the cleaned transcript text — no preamble, labels, or commentary\n"
    )

    refined_chunks = []
    for i, chunk in enumerate(chunks):
        try:
            user_prompt = (
                f"Lecture: {session_title}{topic_context}\n\n"
                f"Clean up this transcript chunk ({i+1}/{len(chunks)}):\n\n"
                f"{chunk}\n\n"
                f"CLEANED TRANSCRIPT:"
            )

            completion = groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=GROQ_MODEL,
                temperature=0.15,
                max_tokens=1500
            )

            refined = completion.choices[0].message.content.strip()

            # Strip any LLM preamble
            for prefix in [
                "CLEANED TRANSCRIPT:", "Here is the cleaned",
                "Here's the cleaned", "Cleaned transcript:",
            ]:
                if refined.lower().startswith(prefix.lower()):
                    refined = refined[len(prefix):].strip()
                    break

            # Length sanity check — refuse if output is too compressed
            ratio = len(refined) / max(len(chunk), 1)
            if ratio < 0.65:
                print(f"  ⚠️  Chunk {i+1}: refinement too aggressive ({ratio:.0%}), using original")
                refined_chunks.append(chunk)
            else:
                print(f"  ✅ Chunk {i+1}/{len(chunks)} refined ({len(chunk)} → {len(refined)} chars)")
                refined_chunks.append(refined)

        except Exception as e:
            print(f"  ❌ Chunk {i+1} refinement failed: {e} — using original")
            refined_chunks.append(chunk)

    return " ".join(refined_chunks)


async def process_uploaded_recording(
    session_id: str,
    file_path: str,
    original_filename: str,
    session_title: str,
    topic: str = ""
):
    """
    Main async orchestrator. Called as a FastAPI BackgroundTask.
    Updates MongoDB at each stage so the frontend can poll progress.
    """
    import database_mongo as db
    from recording_enhancer import validate_and_extract_audio
    from transcribe_enhanced import transcribe_file
    from rag_pipeline import rag_pipeline

    wav_path = None

    try:
        # ──────────────────────────────────────────────────────────
        # Stage 1 — Convert to WAV
        # ──────────────────────────────────────────────────────────
        print(f"\n{'='*60}")
        print(f"📤 UPLOAD PROCESSING START: {session_title}")
        print(f"   Session: {session_id}")
        print(f"   File: {original_filename}")
        print(f"{'='*60}")

        db.update_processing_status(session_id, "processing", "converting")

        try:
            wav_path = await asyncio.to_thread(
                validate_and_extract_audio, file_path, original_filename
            )
            print(f"✅ Stage 1 — Audio converted: {wav_path}")
        except Exception as e:
            print(f"❌ Stage 1 — Audio conversion failed: {e}")
            traceback.print_exc()
            db.update_processing_status(
                session_id, "failed", "converting",
                error=f"Audio conversion failed: {str(e)}"
            )
            return

        # ──────────────────────────────────────────────────────────
        # Stage 2 — Transcribe
        # ──────────────────────────────────────────────────────────
        db.update_processing_status(session_id, "processing", "transcribing")

        try:
            result = await asyncio.to_thread(transcribe_file, wav_path, "medium")

            if result.get("error"):
                raise RuntimeError(result["error"])

            raw_transcript = result.get("transcript", "")
            if not raw_transcript or len(raw_transcript.strip()) < 10:
                raise RuntimeError("Transcription produced no usable text.")

            print(f"✅ Stage 2 — Transcribed: {len(raw_transcript)} chars")
        except Exception as e:
            print(f"❌ Stage 2 — Transcription failed: {e}")
            traceback.print_exc()
            db.update_processing_status(
                session_id, "failed", "transcribing",
                error=f"Transcription failed: {str(e)}"
            )
            return
        finally:
            # Clean up WAV file
            if wav_path and os.path.exists(wav_path):
                try:
                    os.unlink(wav_path)
                except Exception:
                    pass

        # ──────────────────────────────────────────────────────────
        # Stage 3 — Refine with Groq
        # ──────────────────────────────────────────────────────────
        db.update_processing_status(session_id, "processing", "refining")

        try:
            refined_transcript = await asyncio.to_thread(
                _refine_upload_transcript, raw_transcript, session_title, topic
            )
            print(f"✅ Stage 3 — Refined: {len(raw_transcript)} → {len(refined_transcript)} chars")
        except Exception as e:
            print(f"⚠️  Stage 3 — Refinement failed: {e} — using raw transcript")
            refined_transcript = raw_transcript

        # ──────────────────────────────────────────────────────────
        # Stage 4 — RAG Indexing
        # ──────────────────────────────────────────────────────────
        db.update_processing_status(session_id, "processing", "indexing")

        try:
            await rag_pipeline.index_session(
                session_id=session_id,
                transcript=refined_transcript,
                session_title=session_title
            )
            print(f"✅ Stage 4 — RAG indexed")
        except Exception as e:
            print(f"⚠️  Stage 4 — RAG indexing failed: {e} — session still usable")
            # Non-fatal: session is usable without RAG, indexing can happen lazily

        # ──────────────────────────────────────────────────────────
        # Stage 5 — Complete
        # ──────────────────────────────────────────────────────────
        db.update_processing_status(
            session_id, "complete", "complete",
            transcript=refined_transcript
        )

        print(f"\n{'='*60}")
        print(f"✅ UPLOAD PROCESSING COMPLETE: {session_title}")
        print(f"   Session: {session_id}")
        print(f"   Transcript: {len(refined_transcript)} chars")
        print(f"{'='*60}\n")

    except Exception as e:
        # Catch-all — never crash silently
        print(f"❌ UPLOAD PROCESSING FATAL ERROR: {e}")
        traceback.print_exc()
        try:
            db.update_processing_status(
                session_id, "failed", "unknown",
                error=f"Unexpected error: {str(e)}"
            )
        except Exception:
            pass
    finally:
        # Clean up any leftover temp files
        for path in [file_path, wav_path]:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception:
                    pass
