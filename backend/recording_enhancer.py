"""
Recording Enhancer — Enhance live transcripts with post-class recording.

Pipeline:
1. Validate & convert uploaded file to mono 16kHz WAV via FFmpeg
2. Transcribe recording with high-quality settings
3. Align live and recording transcripts via fuzzy sentence matching
4. Reconcile aligned pairs via Groq LLM
5. Enhance final transcript flow via Groq
6. Generate word-level diff for frontend display
"""

import os
import re
import json
import asyncio
import tempfile
import subprocess
import difflib
from typing import Optional, List, Dict, Any
from groq import Groq
from difflib import SequenceMatcher

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "moonshotai/kimi-k2-instruct-0905"

# Transcription quality settings for recording (higher than live)
RECORDING_BEAM_SIZE = 10
RECORDING_BEST_OF = 5

# Alignment settings
MIN_SIMILARITY_THRESHOLD = 0.35  # below this a sentence is considered a gap
ALIGNMENT_CHUNK_SIZE = 10        # sentence pairs per reconciliation call

# File handling
MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024   # 500MB hard limit
SUPPORTED_AUDIO = {'.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'}
SUPPORTED_VIDEO = {'.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v'}
TEMP_DIR = "./ai/temp_recordings"


# ──────────────────────────────────────────────────────────────
# Audio Validation & Conversion
# ──────────────────────────────────────────────────────────────

def validate_and_extract_audio(file_path: str, original_filename: str) -> str:
    """
    Validate the uploaded file and convert it to mono 16kHz WAV for Whisper.
    Synchronous — called via asyncio.to_thread.
    """
    # Step 1 — Check file extension
    ext = os.path.splitext(original_filename)[1].lower()
    supported = SUPPORTED_AUDIO | SUPPORTED_VIDEO
    if ext not in supported:
        raise ValueError(
            f"Unsupported file type: {ext}. Supported: mp3, wav, m4a, mp4, webm, mkv, mov, avi, m4v, flac, ogg"
        )

    # Step 2 — Check file size
    if os.path.getsize(file_path) > MAX_FILE_SIZE_BYTES:
        raise ValueError("File too large. Maximum size is 500MB.")

    # Step 3 — Build FFmpeg command
    output_path = file_path.replace(os.path.splitext(file_path)[1], '_converted.wav')
    cmd = [
        'ffmpeg', '-i', file_path,
        '-vn',              # strip video track if present
        '-acodec', 'pcm_s16le',  # 16-bit PCM
        '-ar', '16000',     # 16kHz sample rate (Whisper's native)
        '-ac', '1',         # mono
        '-y',               # overwrite without asking
        output_path
    ]

    # Step 4 — Run FFmpeg
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg conversion failed: {result.stderr.decode()}")
    except FileNotFoundError:
        raise RuntimeError(
            "FFmpeg is not installed on this server. "
            "Install with: brew install ffmpeg (Mac) or apt install ffmpeg (Linux)"
        )

    # Step 5 — Delete original uploaded file to save space
    try:
        os.unlink(file_path)
    except Exception:
        pass

    return output_path


# ──────────────────────────────────────────────────────────────
# Transcription
# ──────────────────────────────────────────────────────────────

def transcribe_recording(
    wav_path: str,
    session_title: str,
    domain_keywords: Optional[List[str]] = None
) -> str:
    """
    Transcribe the converted WAV using transcribe_enhanced.py with elevated
    quality settings specifically for post-processing (not real-time).
    """
    from transcribe_enhanced import transcribe_file

    try:
        result = transcribe_file(wav_path, model_name="medium")

        if result.get("error"):
            raise RuntimeError(result["error"])

        transcript = result.get("transcript", "")
        if not transcript or len(transcript.strip()) < 10:
            raise RuntimeError("Transcription produced no usable text from the recording.")

        return transcript
    finally:
        # Clean up WAV file after transcription regardless of success or failure
        if wav_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except Exception:
                pass


# ──────────────────────────────────────────────────────────────
# Sentence Splitting & Similarity
# ──────────────────────────────────────────────────────────────

def split_into_sentences(text: str) -> List[str]:
    """Split text into individual sentences for alignment."""
    if not text:
        return []
    raw = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in raw if s.strip() and len(s.strip()) >= 5]


def compute_similarity(a: str, b: str) -> float:
    """Return 0-1 similarity score between two strings."""
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


# ──────────────────────────────────────────────────────────────
# Transcript Alignment
# ──────────────────────────────────────────────────────────────

def align_transcripts(
    live_sentences: List[str],
    recording_sentences: List[str]
) -> List[Dict]:
    """
    Produce aligned pairs using a sliding window approach that handles
    gaps, insertions, and partial overlaps.
    """
    aligned_pairs: List[Dict] = []
    live_idx = 0
    rec_idx = 0
    WINDOW = 8  # look-ahead window

    while live_idx < len(live_sentences) and rec_idx < len(recording_sentences):
        # Find best match for live_sentences[live_idx] within
        # recording_sentences[rec_idx : rec_idx + WINDOW]
        best_score = 0.0
        best_offset = 0
        window_end = min(rec_idx + WINDOW, len(recording_sentences))

        for k in range(window_end - rec_idx):
            score = compute_similarity(
                live_sentences[live_idx],
                recording_sentences[rec_idx + k]
            )
            if score > best_score:
                best_score = score
                best_offset = k

        if best_score >= MIN_SIMILARITY_THRESHOLD:
            # Insert gap entries for skipped recording sentences
            if best_offset > 0:
                for k in range(best_offset):
                    aligned_pairs.append({
                        "live": None,
                        "recording": recording_sentences[rec_idx + k],
                        "similarity": 0.0,
                        "type": "recording_only"
                    })

            # The sentences align
            aligned_pairs.append({
                "live": live_sentences[live_idx],
                "recording": recording_sentences[rec_idx + best_offset],
                "similarity": best_score,
                "type": "aligned"
            })

            rec_idx = rec_idx + best_offset + 1
            live_idx += 1
        else:
            # No match in window — live-only
            aligned_pairs.append({
                "live": live_sentences[live_idx],
                "recording": None,
                "similarity": 0.0,
                "type": "live_only"
            })
            live_idx += 1

    # Remaining recording sentences (beyond live coverage)
    while rec_idx < len(recording_sentences):
        aligned_pairs.append({
            "live": None,
            "recording": recording_sentences[rec_idx],
            "similarity": 0.0,
            "type": "recording_only"
        })
        rec_idx += 1

    return aligned_pairs


# ──────────────────────────────────────────────────────────────
# Reconciliation via Groq
# ──────────────────────────────────────────────────────────────

def reconcile_chunk(
    chunk: List[Dict],
    session_title: str,
    groq_client: Groq
) -> str:
    """
    Takes a chunk of aligned pairs and calls Groq to produce the best
    merged text. Includes exponential backoff for 429 rate limiting.
    """
    # Build input representation
    lines = []
    for pair in chunk:
        if pair['type'] == 'aligned':
            lines.append(f"LIVE: {pair['live']}")
            lines.append(f"RECORDING: {pair['recording']}")
            lines.append(f"SIMILARITY: {pair['similarity']:.2f}")
            lines.append("---")
        elif pair['type'] == 'recording_only':
            lines.append(f"RECORDING ONLY (missing from live): {pair['recording']}")
            lines.append("---")
        elif pair['type'] == 'live_only':
            lines.append(f"LIVE ONLY (may be noise or live addition): {pair['live']}")
            lines.append("---")
    input_text = "\n".join(lines)

    system_prompt = (
        "You are an expert transcript reconciliation specialist. You are given two versions "
        "of the same lecture segment — one from a live microphone transcription (lower quality, "
        "may have errors) and one from a post-class recording transcription (higher quality, "
        "more accurate). Your job is to produce the single best version of the transcript that:\n"
        "1. Prefers the recording version for factual content and technical terms when they differ\n"
        "2. Includes ALL content from the recording that is missing from the live transcript\n"
        "3. Corrects technical terms, numbers, formulas, and proper nouns using the recording as ground truth\n"
        "4. Preserves natural sentence flow — output reads as natural spoken lecture text\n"
        "5. Does NOT summarize — every piece of information must be preserved\n"
        "6. Removes obvious transcription noise from the live version (repeated words, garbled phrases) "
        "when the recording provides a clean alternative\n\n"
        "Output ONLY the reconciled transcript text for this segment. No labels, no explanations, "
        "no markdown. Just the clean prose transcript."
    )

    user_prompt = (
        f"Lecture: {session_title}\n\n"
        f"Segment to reconcile:\n{input_text}\n\n"
        f"Produce the best merged transcript for this segment:"
    )

    # Retry with exponential backoff for rate limiting
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = groq_client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=GROQ_MODEL,
                max_tokens=1000,
                temperature=0
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            error_str = str(e)
            if '429' in error_str or 'rate' in error_str.lower():
                wait_time = 2 ** (attempt + 1)  # 2s, 4s, 8s
                print(f"  ⚠️  Groq rate limited, waiting {wait_time}s (attempt {attempt + 1}/{max_retries})...")
                import time
                time.sleep(wait_time)
                continue
            else:
                print(f"  ⚠️  Groq reconciliation failed: {e}")
                break

    # Fallback: concatenate recording-version sentences
    print("  ⚠️  Using fallback (recording text direct concatenation) for this chunk")
    fallback_parts = []
    for pair in chunk:
        if pair['type'] == 'aligned':
            fallback_parts.append(pair['recording'])
        elif pair['type'] == 'recording_only':
            fallback_parts.append(pair['recording'])
        # Skip live_only in fallback — prefer recording content
    return " ".join(fallback_parts)


async def _reconcile_all_chunks(
    aligned_pairs: List[Dict],
    session_title: str,
    groq_client: Groq
) -> str:
    """
    Reconcile all aligned pairs in chunks, with limited concurrency.
    """
    # Group into chunks of ALIGNMENT_CHUNK_SIZE
    chunks = []
    for i in range(0, len(aligned_pairs), ALIGNMENT_CHUNK_SIZE):
        chunks.append(aligned_pairs[i:i + ALIGNMENT_CHUNK_SIZE])

    if not chunks:
        return ""

    semaphore = asyncio.Semaphore(3)  # max 3 concurrent Groq calls

    async def process_chunk(chunk: List[Dict]) -> str:
        async with semaphore:
            result = await asyncio.to_thread(reconcile_chunk, chunk, session_title, groq_client)
            await asyncio.sleep(0.2)  # small delay to avoid burst rate limiting
            return result

    results = await asyncio.gather(*[process_chunk(c) for c in chunks])
    return " ".join(results)


# ──────────────────────────────────────────────────────────────
# Flow Enhancement
# ──────────────────────────────────────────────────────────────

async def enhance_transcript_flow(
    merged_transcript: str,
    session_title: str,
    groq_client: Groq
) -> str:
    """
    Final pass over the complete merged transcript to fix chunk boundary
    artifacts and ensure smooth flow.
    """
    if not merged_transcript or len(merged_transcript) <= 500:
        return merged_transcript

    # Split into chunks of ~2000 chars at sentence boundaries
    sentences = split_into_sentences(merged_transcript)
    if not sentences:
        return merged_transcript

    text_chunks = []
    current_chunk = ""
    for sentence in sentences:
        if len(current_chunk) + len(sentence) + 1 > 2000 and current_chunk:
            text_chunks.append(current_chunk)
            current_chunk = sentence
        else:
            current_chunk = (current_chunk + " " + sentence).strip() if current_chunk else sentence
    if current_chunk:
        text_chunks.append(current_chunk)

    system_prompt = (
        "You are a professional transcript editor. Clean up the following lecture transcript "
        "segment. Fix any awkward sentence boundaries, remove duplicate phrases that appeared "
        "at chunk boundaries, ensure smooth natural flow. Do NOT change any factual content, "
        "do NOT summarize, do NOT add information not present. Only fix flow and remove "
        "artifact repetitions. Output only the cleaned transcript text."
    )

    async def enhance_one_chunk(chunk_text: str) -> str:
        try:
            response = await asyncio.to_thread(
                lambda: groq_client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": chunk_text}
                    ],
                    model=GROQ_MODEL,
                    max_tokens=2000,
                    temperature=0
                )
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"  ⚠️  Flow enhancement failed for chunk: {e}")
            return chunk_text  # return original on failure

    enhanced_parts = []
    for chunk in text_chunks:
        result = await enhance_one_chunk(chunk)
        enhanced_parts.append(result)
        await asyncio.sleep(0.2)  # rate limit protection

    return " ".join(enhanced_parts)


# ──────────────────────────────────────────────────────────────
# Diff Generation
# ──────────────────────────────────────────────────────────────

def generate_diff_tokens(
    original: str,
    enhanced: str,
    max_chars: int = 5000
) -> List[Dict[str, str]]:
    """
    Generate word-level diff tokens for frontend display.
    Uses difflib.ndiff for word-level comparison.
    """
    original_words = original.split()
    enhanced_words = enhanced.split()

    diff = list(difflib.ndiff(original_words, enhanced_words))

    tokens: List[Dict[str, str]] = []
    char_count = 0

    for item in diff:
        if char_count >= max_chars:
            tokens.append({"type": "unchanged", "text": " [... diff truncated for performance]"})
            break

        if item.startswith('  '):
            # Unchanged word
            word = item[2:]
            tokens.append({"type": "unchanged", "text": word + " "})
            char_count += len(word) + 1
        elif item.startswith('- '):
            # Removed from original
            word = item[2:]
            tokens.append({"type": "removed", "text": word + " "})
            char_count += len(word) + 1
        elif item.startswith('+ '):
            # Added in enhanced
            word = item[2:]
            tokens.append({"type": "added", "text": word + " "})
            char_count += len(word) + 1
        # Skip '? ' lines (hint lines from ndiff)

    return tokens


# ──────────────────────────────────────────────────────────────
# Main Orchestrator
# ──────────────────────────────────────────────────────────────

async def enhance_with_recording(
    session_id: str,
    live_transcript: str,
    recording_file_path: str,
    original_filename: str,
    session_title: str,
    domain_keywords: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Main orchestrating function — called by the endpoint.
    Takes raw uploaded file through to final reconciled transcript.
    """

    wav_path = None

    # Step 1 — Convert audio
    try:
        wav_path = await asyncio.to_thread(
            validate_and_extract_audio, recording_file_path, original_filename
        )
        print(f"✅ Audio converted: {wav_path}")
    except Exception as e:
        print(f"❌ Audio conversion failed: {e}")
        return {"error": str(e), "stage": "conversion",
                "enhanced_transcript": None, "recording_transcript": None,
                "diff_tokens": [], "stats": None}

    # Step 2 — Transcribe recording
    try:
        recording_transcript = await asyncio.to_thread(
            transcribe_recording, wav_path, session_title, domain_keywords
        )
        # wav_path is cleaned up inside transcribe_recording's finally
        wav_path = None
        print(f"✅ Recording transcribed: {len(recording_transcript)} chars")
    except Exception as e:
        print(f"❌ Transcription failed: {e}")
        return {"error": str(e), "stage": "transcription",
                "enhanced_transcript": None, "recording_transcript": None,
                "diff_tokens": [], "stats": None}

    # Step 3 — Align
    live_sentences = split_into_sentences(live_transcript)
    recording_sentences = split_into_sentences(recording_transcript)
    aligned_pairs = align_transcripts(live_sentences, recording_sentences)
    print(f"✅ Alignment complete: {len(aligned_pairs)} pairs "
          f"({len([p for p in aligned_pairs if p['type'] == 'aligned'])} aligned, "
          f"{len([p for p in aligned_pairs if p['type'] == 'recording_only'])} gaps, "
          f"{len([p for p in aligned_pairs if p['type'] == 'live_only'])} live-only)")

    # Step 4 — Reconcile in chunks
    groq_client = Groq(api_key=GROQ_API_KEY)
    try:
        merged_transcript = await _reconcile_all_chunks(
            aligned_pairs, session_title, groq_client
        )
        print(f"✅ Reconciliation complete: {len(merged_transcript)} chars")
    except Exception as e:
        print(f"❌ Reconciliation failed: {e}")
        # Fallback: use recording transcript directly
        merged_transcript = recording_transcript
        print("  ⚠️  Using recording transcript as fallback")

    # Step 5 — Enhance flow
    try:
        enhanced_transcript = await enhance_transcript_flow(
            merged_transcript, session_title, groq_client
        )
        print(f"✅ Flow enhancement complete: {len(enhanced_transcript)} chars")
    except Exception as e:
        print(f"⚠️  Flow enhancement failed: {e}")
        enhanced_transcript = merged_transcript

    # Step 6 — Build diff data for frontend
    diff_tokens = generate_diff_tokens(live_transcript, enhanced_transcript)

    # Step 7 — Return
    return {
        "enhanced_transcript": enhanced_transcript,
        "recording_transcript": recording_transcript,
        "diff_tokens": diff_tokens,
        "stats": {
            "live_word_count": len(live_transcript.split()),
            "recording_word_count": len(recording_transcript.split()),
            "enhanced_word_count": len(enhanced_transcript.split()),
            "aligned_pairs": len([p for p in aligned_pairs if p['type'] == 'aligned']),
            "gaps_filled": len([p for p in aligned_pairs if p['type'] == 'recording_only']),
            "live_only_segments": len([p for p in aligned_pairs if p['type'] == 'live_only']),
        },
        "error": None,
        "stage": "complete"
    }
