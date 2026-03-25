#!/usr/bin/env python3
"""
Enhanced transcription module with guaranteed terminal output.
Optimized for 4GB GPU + lecture audio with robust output handling.
"""

import os
import re
import sys
import tempfile
import traceback
from typing import Optional, List, Dict, Any
from pathlib import Path

# UTF-8 encoding is handled by the CLI entry point (transcribe_cli_enhanced.py).
# Do NOT replace sys.stdout here — this module is imported, not run standalone.

# ------------------------------------------------------------------------------
# Constants
# ------------------------------------------------------------------------------

MIN_CHARS_RATIO = 0.60
EXPECTED_CPS = 8.0

# Max times a sentence can appear before it's considered hallucination
MAX_SENTENCE_REPEATS = 2
# If this fraction of sentences in a chunk are identical, reject it
HALLUCINATION_DOMINANCE_RATIO = 0.50

# ------------------------------------------------------------------------------
# Hallucination patterns
# ------------------------------------------------------------------------------

_HALLUCINATION_RE = re.compile(
    r"("
    r"thank you for watching|thanks for watching|please subscribe|"
    r"like and subscribe|see you next time|don't forget to subscribe|"
    r"smash the like button|hit the bell|leave a comment|"
    r"♪|🎵"
    r")",
    re.IGNORECASE,
)

_REPEATED_WORD_RE = re.compile(r"\b(\w+)(\s+\1){2,}\b", re.IGNORECASE)


# ------------------------------------------------------------------------------
# Output helper - ENSURES output is displayed
# ------------------------------------------------------------------------------

def log(msg: str, file=None):
    """Print message and force flush to ensure it appears."""
    target = file if file else sys.stdout
    print(msg, file=target)
    target.flush()


def log_error(msg: str):
    """Print error message and force flush."""
    print(f"[ERROR] {msg}", file=sys.stderr)
    sys.stderr.flush()


# ------------------------------------------------------------------------------
# Silence-based chunking
# ------------------------------------------------------------------------------

def _split_by_silence(
    audio_path: str,
    silence_thresh_db: float = -40.0,
    min_silence_len_ms: int = 2000,
    keep_padding_ms: int = 500,
) -> List[Dict[str, Any]]:
    """Split audio by natural silence boundaries."""
    from pydub import AudioSegment
    from pydub.silence import split_on_silence

    audio = AudioSegment.from_file(audio_path)
    total_len = len(audio)

    chunks = split_on_silence(
        audio,
        min_silence_len=min_silence_len_ms,
        silence_thresh=silence_thresh_db,
        keep_silence=keep_padding_ms,
    )

    if not chunks:
        return [{'path': audio_path, 'start_ms': 0, 'end_ms': total_len}]

    result = []
    current_pos = 0

    for i, chunk in enumerate(chunks):
        start_ms = current_pos
        end_ms = start_ms + len(chunk)

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            chunk.export(tmp.name, format='wav')
            result.append({
                'path': tmp.name,
                'start_ms': start_ms,
                'end_ms': end_ms,
            })

        current_pos = end_ms

    return result


def _merge_chunks(chunk_results: List[Dict], overlap_ms: int = 500) -> str:
    """Merge transcribed chunks with overlap resolution."""
    if not chunk_results:
        return ""

    if len(chunk_results) == 1:
        return chunk_results[0]['text']

    merged = chunk_results[0]['text']

    for i in range(1, len(chunk_results)):
        next_text = chunk_results[i]['text']
        if not next_text:
            continue
        merged += " " + next_text

    return merged


# ------------------------------------------------------------------------------
# Sentence-level deduplication (anti-hallucination)
# ------------------------------------------------------------------------------

def _split_sentences(text: str) -> List[str]:
    """Split text into sentences on . ? ! boundaries."""
    # Split on sentence-ending punctuation followed by space or end
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def _dedup_sentences(text: str, max_repeats: int = MAX_SENTENCE_REPEATS) -> str:
    """
    Remove excessively repeated sentences.
    Keeps the FIRST `max_repeats` occurrences of any sentence, drops the rest.
    """
    if not text:
        return text

    sentences = _split_sentences(text)
    if len(sentences) <= 1:
        return text

    counts: Dict[str, int] = {}
    kept: List[str] = []

    for sent in sentences:
        # Normalize for comparison (lowercase, strip trailing punctuation/spaces)
        key = re.sub(r'[\s.!?,;:]+$', '', sent.lower().strip())
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
        if counts[key] <= max_repeats:
            kept.append(sent)
        # else: silently drop the repeated sentence

    return " ".join(kept)


def _is_hallucinated_chunk(text: str) -> bool:
    """
    Detect if a chunk is mostly hallucinated.
    Returns True if a single sentence dominates >50% of the chunk.
    """
    if not text or len(text) < 20:
        return False

    sentences = _split_sentences(text)
    if len(sentences) < 4:
        return False

    # Count normalized sentences
    counts: Dict[str, int] = {}
    for sent in sentences:
        key = re.sub(r'[\s.!?,;:]+$', '', sent.lower().strip())
        if key:
            counts[key] = counts.get(key, 0) + 1

    if not counts:
        return False

    most_common_count = max(counts.values())
    dominance = most_common_count / len(sentences)

    if dominance >= HALLUCINATION_DOMINANCE_RATIO:
        log(f"    [!] Hallucination detected: one sentence repeated "
            f"{most_common_count}/{len(sentences)} times ({dominance:.0%})")
        return True

    return False


# ------------------------------------------------------------------------------
# Post-processing
# ------------------------------------------------------------------------------

def _postprocess(text: str) -> str:
    """Apply post-processing to remove hallucinations and clean text."""
    if not text:
        return text

    # 1. Remove known hallucination phrases (YouTube outros, etc.)
    text = _HALLUCINATION_RE.sub("", text)

    # 2. Fix repeated adjacent words ("the the the" -> "the")
    text = _REPEATED_WORD_RE.sub(lambda m: m.group(1), text)

    # 3. Remove repeated sentences (the main anti-hallucination step)
    text = _dedup_sentences(text)

    # 4. Clean whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


# ------------------------------------------------------------------------------
# Single chunk transcription
# ------------------------------------------------------------------------------

def _transcribe_chunk(
    model,
    audio_path: str,
    no_speech_threshold: float,
    log_prob_threshold: float,
    temperature,
    initial_prompt: Optional[str],
) -> tuple[List[str], Any, int]:
    """Transcribe a single audio chunk."""
    segments_iter, info = model.transcribe(
        audio_path,
        language="en",
        beam_size=5,
        temperature=temperature,
        condition_on_previous_text=False,
        initial_prompt=initial_prompt,
        no_speech_threshold=no_speech_threshold,
        hallucination_silence_threshold=1.0,
        log_prob_threshold=log_prob_threshold,
        vad_filter=True,
        vad_parameters=dict(
            threshold=0.45,
            min_silence_duration_ms=400,
            speech_pad_ms=150,
            min_speech_duration_ms=600,
            max_speech_duration_s=28.0,
        ),
    )

    parts = []
    rejected = 0
    for seg in segments_iter:
        text = seg.text.strip()
        if not text:
            continue
        if seg.no_speech_prob > no_speech_threshold:
            rejected += 1
            continue
        parts.append(text)

    return parts, info, rejected


# ------------------------------------------------------------------------------
# Main transcription API
# ------------------------------------------------------------------------------

def transcribe_file(file_path: str, model_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Transcribe an audio file with optimized settings for 4GB GPU.

    Args:
        file_path: Path to audio file
        model_name: Whisper model name (default: medium)

    Returns:
        Dictionary with transcript, duration, language, error
    """
    # Check faster-whisper is available
    try:
        import faster_whisper
    except ImportError:
        log_error("faster-whisper not installed. Run: pip install faster-whisper")
        return {
            "error": "faster-whisper not installed. Run: pip install faster-whisper",
            "transcript": "",
            "duration": 0,
        }

    # Check file exists
    if not os.path.exists(file_path):
        msg = f"File not found: {file_path}"
        log_error(msg)
        return {"error": msg, "transcript": "", "duration": 0}

    # Model configuration
    if model_name is None:
        model_name = os.getenv("TRANSCRIBER_MODEL", "medium")

    device = os.getenv("TRANSCRIBER_DEVICE", "cuda")
    compute = "int8" if device == "cuda" else "int8"

    log(f"[*] Loading Whisper '{model_name}' on {device} ({compute})...")

    # Load model with fallback to CPU
    try:
        model = faster_whisper.WhisperModel(
            model_name, device=device, compute_type=compute
        )
        log(f"[+] Model loaded successfully on {device}")
    except Exception as e:
        log(f"[!] GPU load failed ({e}), falling back to CPU...")
        device = "cpu"
        compute = "int8"
        model = faster_whisper.WhisperModel(
            model_name, device="cpu", compute_type="int8"
        )
        log("[+] Model loaded on CPU")

    # Get audio duration
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(file_path)
        total_duration_s = len(audio) / 1000
        log(f"[*] Audio duration: {total_duration_s:.1f}s ({total_duration_s/60:.1f} min)")
    except Exception as e:
        log(f"[!] Could not determine audio duration: {e}")
        total_duration_s = 0

    # Split by silence
    log("[*] Splitting audio by silence...")
    chunks = _split_by_silence(file_path)
    log(f"[+] Split into {len(chunks)} natural chunks")

    # Process chunks
    all_parts = []
    total_rejected = 0

    for i, chunk in enumerate(chunks):
        chunk_duration_ms = chunk['end_ms'] - chunk['start_ms']
        log(f"\n[*] Processing chunk {i+1}/{len(chunks)} ({chunk_duration_ms:.0f}ms)")

        # Pass 1: aggressive
        parts1, info, rejected1 = _transcribe_chunk(
            model,
            chunk['path'],
            no_speech_threshold=0.80,
            log_prob_threshold=-1.5,
            temperature=0.0,
            initial_prompt=None,
        )
        raw1 = " ".join(parts1).strip()

        expected_chars = (chunk_duration_ms / 1000) * EXPECTED_CPS
        ratio = len(raw1) / max(expected_chars, 1)

        # Reject chunk if hallucination dominates
        if _is_hallucinated_chunk(raw1):
            log(f"    [!] Chunk {i+1} rejected as hallucination")
            raw1 = ""
            parts1 = []

        # Pass 2 if needed (tighter thresholds to avoid hallucination)
        if ratio < MIN_CHARS_RATIO and not _is_hallucinated_chunk(raw1):
            log(f"    Pass 1 yield low ({ratio:.2f}), trying Pass 2...")
            parts2, _, rejected2 = _transcribe_chunk(
                model,
                chunk['path'],
                no_speech_threshold=0.70,
                log_prob_threshold=-1.8,
                temperature=0.0,
                initial_prompt=None,
            )
            raw2 = " ".join(parts2).strip()
            # Only accept Pass 2 if it's NOT hallucinated and longer
            if len(raw2) > len(raw1) and not _is_hallucinated_chunk(raw2):
                raw = raw2
                rejected = rejected2
            else:
                raw = raw1
                rejected = rejected1
        else:
            raw = raw1
            rejected = rejected1

        all_parts.append({
            'text': raw,
            'start_ms': chunk['start_ms'],
            'end_ms': chunk['end_ms'],
        })
        total_rejected += rejected

        log(f"    [+] {len(raw)} chars, {rejected} rejected segments")

    # Merge chunks
    log("\n[*] Merging chunks...")
    raw = _merge_chunks(all_parts)

    # Post-process
    clean = _postprocess(raw)
    removed_chars = len(raw) - len(clean)
    if removed_chars > 0:
        log(f"[*] Post-processing removed {removed_chars} chars")

    # Final stats
    log(f"\n[*] Final stats:")
    log(f"    Chunks processed: {len(chunks)}")
    log(f"    Total rejected: {total_rejected}")
    log(f"    Transcript length: {len(clean)} chars")
    if total_duration_s > 0:
        log(f"    Chars/sec: {len(clean)/max(total_duration_s, 1):.2f}")

    # Cleanup temp files
    for chunk in chunks:
        if os.path.exists(chunk['path']) and chunk['path'] != file_path:
            try:
                os.unlink(chunk['path'])
            except:
                pass

    return {
        "transcript": clean,
        "duration": total_duration_s,
        "language": "en",
        "error": None,
    }


# ------------------------------------------------------------------------------
# Direct execution helper
# ------------------------------------------------------------------------------

def transcribe_with_output(audio_path: str, save_to_file: bool = False) -> str:
    """
    Transcribe and immediately display/save results.

    Args:
        audio_path: Path to audio file
        save_to_file: Whether to save transcript to file

    Returns:
        The transcript text
    """
    log("=" * 60)
    log("TRANSCRIPTION START")
    log("=" * 60)

    result = transcribe_file(audio_path)

    log("\n" + "=" * 60)
    log("TRANSCRIPTION RESULT")
    log("=" * 60)

    if result.get("error"):
        log_error(f"Transcription failed: {result['error']}")
        return ""

    transcript = result.get("transcript", "")

    # ALWAYS display the transcript
    log(f"\nDuration: {result['duration']:.2f}s")
    log(f"Language: {result['language']}")
    log("\n--- TRANSCRIPT ---")
    log(transcript)
    log("--- END TRANSCRIPT ---")

    # Save if requested
    if save_to_file and transcript:
        output_path = os.path.splitext(audio_path)[0] + "_enhanced.txt"
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(transcript)
            log(f"\n[+] Saved to: {output_path}")
        except Exception as e:
            log_error(f"Failed to save file: {e}")

    return transcript


if __name__ == "__main__":
    # Direct module execution for quick testing
    if len(sys.argv) < 2:
        print("Usage: python transcribe_enhanced.py <audio_file> [--save]")
        sys.exit(1)

    audio_file = sys.argv[1]
    save = "--save" in sys.argv

    transcribe_with_output(audio_file, save_to_file=save)
