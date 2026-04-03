#!/usr/bin/env python3
"""
Enhanced transcription module with guaranteed terminal output.
Optimized for 4GB GPU + lecture audio with robust output handling.
"""

import os
import re
import sys
import subprocess
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

MAX_SENTENCE_REPEATS = 2
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
# Output helper
# ------------------------------------------------------------------------------

def log(msg: str, file=None):
    target = file if file else sys.stdout
    print(msg, file=target)
    target.flush()


def log_error(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr)
    sys.stderr.flush()


# ------------------------------------------------------------------------------
# ffmpeg/ffprobe helpers  (no pydub, no full-file RAM load)
# ------------------------------------------------------------------------------

def _get_duration_ms(audio_path: str) -> int:
    """Return audio duration in milliseconds using ffprobe. Never raises."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode == 0 and r.stdout.strip():
            return int(float(r.stdout.strip()) * 1000)
    except Exception as e:
        log(f"[!] ffprobe failed: {e}")
    return 0


def _ffmpeg_extract(audio_path: str, start_ms: int, end_ms: int) -> Optional[str]:
    """
    Extract [start_ms, end_ms] from audio_path to a temp WAV file.
    Returns the temp file path, or None on failure.
    """
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        cmd = [
            "ffmpeg", "-y",
            "-ss", f"{start_ms / 1000:.3f}",
            "-t",  f"{(end_ms - start_ms) / 1000:.3f}",
            "-i",  audio_path,
            "-ar", "16000", "-ac", "1",   # whisper wants 16 kHz mono
            tmp_path,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode == 0 and os.path.getsize(tmp_path) > 0:
            return tmp_path
        os.unlink(tmp_path)
    except Exception as e:
        log(f"[!] ffmpeg extract failed ({start_ms}-{end_ms}ms): {e}")
    return None


# ------------------------------------------------------------------------------
# Silence-based chunking  (ffmpeg only, no pydub RAM load)
# ------------------------------------------------------------------------------

def _split_by_silence(
    audio_path: str,
    silence_thresh_db: float = -40.0,
    min_silence_len_ms: int = 2000,
    keep_padding_ms: int = 500,
) -> List[Dict[str, Any]]:
    """
    Detect non-silent regions via ffmpeg silencedetect, extract each as a
    temp WAV.  Falls back to the whole file if detection fails.
    """
    total_len_ms = _get_duration_ms(audio_path)
    if total_len_ms == 0:
        log("[!] Could not determine duration; treating file as one chunk")
        return [{"path": audio_path, "start_ms": 0, "end_ms": 0, "_is_original": True}]

    # Run silencedetect
    cmd = [
        "ffmpeg", "-i", audio_path, "-af",
        f"silencedetect=noise={silence_thresh_db}dB:d={min_silence_len_ms / 1000:.3f}",
        "-f", "null", "-",
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        stderr = r.stderr
    except subprocess.TimeoutExpired:
        log("[!] silencedetect timed out; treating as one chunk")
        stderr = ""

    # Parse silence_start / silence_end
    silence_starts = [float(m) * 1000 for m in re.findall(r"silence_start:\s*([\d.]+)", stderr)]
    silence_ends   = [float(m) * 1000 for m in re.findall(r"silence_end:\s*([\d.]+)\s*\|", stderr)]

    if not silence_starts:
        log("[*] No silence detected; treating as one chunk")
        return [{"path": audio_path, "start_ms": 0, "end_ms": total_len_ms, "_is_original": True}]

    # Build speech ranges (invert silence ranges)
    speech_ranges: List[tuple] = []

    # Before first silence
    if silence_starts[0] > 200:
        speech_ranges.append((0, int(silence_starts[0])))

    # Between silences
    for i, s_end in enumerate(silence_ends):
        next_start = silence_starts[i + 1] if i + 1 < len(silence_starts) else total_len_ms
        if next_start - s_end > 200:
            speech_ranges.append((int(s_end), int(next_start)))

    # After last silence end (if we have one)
    if silence_ends and total_len_ms - silence_ends[-1] > 200:
        speech_ranges.append((int(silence_ends[-1]), total_len_ms))

    if not speech_ranges:
        return [{"path": audio_path, "start_ms": 0, "end_ms": total_len_ms, "_is_original": True}]

    # Merge ranges that are within 1 s of each other
    merged: List[tuple] = [speech_ranges[0]]
    for start, end in speech_ranges[1:]:
        if start - merged[-1][1] < 1000:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    # Extract each range with padding
    result: List[Dict[str, Any]] = []
    for seg_start, seg_end in merged:
        padded_start = max(0, seg_start - keep_padding_ms)
        padded_end   = min(total_len_ms, seg_end + keep_padding_ms)

        tmp_path = _ffmpeg_extract(audio_path, padded_start, padded_end)
        if tmp_path:
            result.append({"path": tmp_path, "start_ms": padded_start, "end_ms": padded_end})
        else:
            # Couldn't extract — skip this chunk; gap-fill will cover it
            log(f"[!] Could not extract chunk {padded_start}-{padded_end}ms, skipping")

    if not result:
        return [{"path": audio_path, "start_ms": 0, "end_ms": total_len_ms, "_is_original": True}]

    return result


def _merge_chunks(chunk_results: List[Dict]) -> str:
    if not chunk_results:
        return ""
    if len(chunk_results) == 1:
        return chunk_results[0]["text"]
    parts = [chunk_results[0]["text"]]
    for chunk in chunk_results[1:]:
        if chunk["text"]:
            parts.append(chunk["text"])
    return " ".join(parts)


# ------------------------------------------------------------------------------
# Sentence-level deduplication
# ------------------------------------------------------------------------------

def _split_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _dedup_sentences(text: str, max_repeats: int = MAX_SENTENCE_REPEATS) -> str:
    if not text:
        return text
    sentences = _split_sentences(text)
    if len(sentences) <= 1:
        return text
    counts: Dict[str, int] = {}
    kept: List[str] = []
    for sent in sentences:
        key = re.sub(r"[\s.!?,;:]+$", "", sent.lower().strip())
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
        if counts[key] <= max_repeats:
            kept.append(sent)
    return " ".join(kept)


def _is_hallucinated_chunk(text: str) -> bool:
    if not text or len(text) < 20:
        return False
    sentences = _split_sentences(text)
    if len(sentences) < 4:
        return False
    counts: Dict[str, int] = {}
    for sent in sentences:
        key = re.sub(r"[\s.!?,;:]+$", "", sent.lower().strip())
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
    if not text:
        return text
    text = _HALLUCINATION_RE.sub("", text)
    text = _REPEATED_WORD_RE.sub(lambda m: m.group(1), text)
    text = _dedup_sentences(text)
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
) -> tuple:
    """Returns (parts, info, rejected_count, rejected_ranges)."""
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
            max_speech_duration_s=60.0,
        ),
    )
    parts: List[str] = []
    rejected = 0
    rejected_ranges: List[tuple] = []
    for seg in segments_iter:
        text = seg.text.strip()
        if not text:
            continue
        if seg.no_speech_prob > no_speech_threshold:
            rejected += 1
            rejected_ranges.append((seg.start, seg.end))
            continue
        parts.append(text)
    return parts, info, rejected, rejected_ranges


# ------------------------------------------------------------------------------
# Main transcription API
# ------------------------------------------------------------------------------

def transcribe_file(file_path: str, model_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Transcribe an audio file with optimized settings for 4GB GPU.
    Uses ffmpeg throughout — never loads full audio into RAM with pydub.
    """
    try:
        import faster_whisper
    except ImportError:
        log_error("faster-whisper not installed. Run: pip install faster-whisper")
        return {"error": "faster-whisper not installed", "transcript": "", "duration": 0}

    if not os.path.exists(file_path):
        msg = f"File not found: {file_path}"
        log_error(msg)
        return {"error": msg, "transcript": "", "duration": 0}

    if model_name is None:
        model_name = os.getenv("TRANSCRIBER_MODEL", "medium")

    device = os.getenv("TRANSCRIBER_DEVICE", "cuda")
    compute = "int8"

    log(f"[*] Loading Whisper '{model_name}' on {device} ({compute})...")

    try:
        model = faster_whisper.WhisperModel(model_name, device=device, compute_type=compute)
        log(f"[+] Model loaded on {device}")
    except Exception as e:
        log(f"[!] GPU load failed ({e}), falling back to CPU...")
        device = "cpu"
        model = faster_whisper.WhisperModel(model_name, device="cpu", compute_type="int8")
        log("[+] Model loaded on CPU")

    total_duration_s = _get_duration_ms(file_path) / 1000.0
    if total_duration_s > 0:
        log(f"[*] Audio duration: {total_duration_s:.1f}s ({total_duration_s/60:.1f} min)")
    else:
        log("[!] Could not determine audio duration; continuing anyway")
        total_duration_s = 1800  # assume 30 min max for gap logic

    log("[*] Splitting audio by silence (ffmpeg, no RAM load)...")
    chunks = _split_by_silence(file_path)
    log(f"[+] Split into {len(chunks)} natural chunks")

    # Track which temp files to delete at the end
    temp_files_to_cleanup: List[str] = [
        c["path"] for c in chunks if not c.get("_is_original")
    ]

    all_parts: List[Dict] = []
    total_rejected = 0
    rejected_absolute_ranges: List[tuple] = []

    for i, chunk in enumerate(chunks):
        chunk_duration_ms = chunk["end_ms"] - chunk["start_ms"]
        log(f"\n[*] Processing chunk {i+1}/{len(chunks)} ({chunk_duration_ms:.0f}ms)")

        # Pass 1
        parts1, info, rejected1, rranges1 = _transcribe_chunk(
            model, chunk["path"],
            no_speech_threshold=0.80,
            log_prob_threshold=-1.5,
            temperature=0.0,
            initial_prompt=None,
        )
        raw1 = " ".join(parts1).strip()

        expected_chars = (chunk_duration_ms / 1000) * EXPECTED_CPS
        ratio = len(raw1) / max(expected_chars, 1)

        if _is_hallucinated_chunk(raw1):
            log(f"    [!] Chunk {i+1} rejected as hallucination")
            raw1 = ""
            parts1 = []

        # Pass 2 if yield is low
        if ratio < MIN_CHARS_RATIO and not _is_hallucinated_chunk(raw1):
            log(f"    Pass 1 yield low ({ratio:.2f}), trying Pass 2...")
            parts2, _, rejected2, rranges2 = _transcribe_chunk(
                model, chunk["path"],
                no_speech_threshold=0.70,
                log_prob_threshold=-1.8,
                temperature=0.0,
                initial_prompt=None,
            )
            raw2 = " ".join(parts2).strip()
            if len(raw2) > len(raw1) and not _is_hallucinated_chunk(raw2):
                raw, rejected, rranges = raw2, rejected2, rranges2
            else:
                raw, rejected, rranges = raw1, rejected1, rranges1
        else:
            raw, rejected, rranges = raw1, rejected1, rranges1

        log(f"    [Chunk {i+1}] {chunk['start_ms']/1000:.2f}s–{chunk['end_ms']/1000:.2f}s")
        log(f"    [Chunk {i+1} Transcription]: {raw if raw else '<empty>'}")
        log(f"    [+] {len(raw)} chars, {rejected} rejected segments")

        all_parts.append({"text": raw, "start_ms": chunk["start_ms"], "end_ms": chunk["end_ms"]})
        total_rejected += rejected

        chunk_offset_ms = chunk["start_ms"]
        for (rs, re_s) in rranges:
            abs_start_ms = chunk_offset_ms + int(rs * 1000)
            abs_end_ms   = chunk_offset_ms + int(re_s * 1000)
            if abs_end_ms - abs_start_ms >= 300:
                rejected_absolute_ranges.append((abs_start_ms, abs_end_ms))

    # ------------------------------------------------------------------
    # Gap-fill pass  (uses ffmpeg extract, never loads full file)
    # ------------------------------------------------------------------
    GAP_FILL_MIN_MS = 1000
    covered = sorted([(p["start_ms"], p["end_ms"]) for p in all_parts if p["text"]])
    total_ms = int(total_duration_s * 1000)
    uncovered: List[tuple] = []
    cursor = 0
    for seg_start, seg_end in covered:
        if seg_start - cursor >= GAP_FILL_MIN_MS:
            uncovered.append((cursor, seg_start))
        cursor = max(cursor, seg_end)
    if total_ms - cursor >= GAP_FILL_MIN_MS:
        uncovered.append((cursor, total_ms))

    if uncovered:
        log(f"\n[*] Gap-fill: {len(uncovered)} uncovered region(s) found")
        for gap_idx, (g_start, g_end) in enumerate(uncovered):
            gap_dur_ms = g_end - g_start
            log(f"    [Gap {gap_idx+1}] {g_start/1000:.2f}s–{g_end/1000:.2f}s ({gap_dur_ms}ms)")
            gtmp = _ffmpeg_extract(file_path, g_start, g_end)
            if gtmp is None:
                log(f"    [Gap {gap_idx+1}] Extract failed, skipping")
                continue
            temp_files_to_cleanup.append(gtmp)
            gparts, _, grejected, _ = _transcribe_chunk(
                model, gtmp,
                no_speech_threshold=0.65,
                log_prob_threshold=-2.0,
                temperature=[0.0, 0.2],
                initial_prompt=None,
            )
            graw = " ".join(gparts).strip()
            if graw and not _is_hallucinated_chunk(graw):
                log(f"    [Gap {gap_idx+1}] Recovered {len(graw)} chars")
                all_parts.append({"text": graw, "start_ms": g_start, "end_ms": g_end})
                total_rejected += grejected
            else:
                log(f"    [Gap {gap_idx+1}] No speech found (or hallucination)")
    else:
        log("\n[*] Gap-fill: no significant gaps detected")

    # ------------------------------------------------------------------
    # Rejected-segment recovery  (uses ffmpeg extract)
    # ------------------------------------------------------------------
    if rejected_absolute_ranges:
        log(f"\n[*] Rejected-segment recovery: {len(rejected_absolute_ranges)} segment(s)")
        for ri, (rs_ms, re_ms) in enumerate(rejected_absolute_ranges):
            log(f"    [Seg {ri+1}] {rs_ms/1000:.2f}s–{re_ms/1000:.2f}s")
            stmp = _ffmpeg_extract(file_path, rs_ms, re_ms)
            if stmp is None:
                log(f"    [Seg {ri+1}] Extract failed, skipping")
                continue
            temp_files_to_cleanup.append(stmp)
            sparts, _, _, _ = _transcribe_chunk(
                model, stmp,
                no_speech_threshold=0.95,
                log_prob_threshold=-2.5,
                temperature=[0.0, 0.2],
                initial_prompt=None,
            )
            sraw = " ".join(sparts).strip()
            if sraw and not _is_hallucinated_chunk(sraw):
                log(f"    [Seg {ri+1}] Recovered {len(sraw)} chars")
                all_parts.append({"text": sraw, "start_ms": rs_ms, "end_ms": re_ms})
            else:
                log(f"    [Seg {ri+1}] Still no usable speech")
    else:
        log("\n[*] Rejected-segment recovery: nothing to recover")

    # Sort chronologically, merge, post-process
    all_parts.sort(key=lambda p: p["start_ms"])
    log("\n[*] Merging chunks...")
    raw = _merge_chunks(all_parts)

    clean = _postprocess(raw)
    removed_chars = len(raw) - len(clean)
    if removed_chars > 0:
        log(f"[*] Post-processing removed {removed_chars} chars")

    log(f"\n[*] Final stats:")
    log(f"    Chunks processed : {len(chunks)}")
    log(f"    Total rejected   : {total_rejected}")
    log(f"    Transcript length: {len(clean)} chars")
    if total_duration_s > 0:
        log(f"    Chars/sec        : {len(clean)/max(total_duration_s, 1):.2f}")

    for tmp_path in temp_files_to_cleanup:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    return {"transcript": clean, "duration": total_duration_s, "language": "en", "error": None}


# ------------------------------------------------------------------------------
# Direct execution helper
# ------------------------------------------------------------------------------

def transcribe_with_output(audio_path: str, save_to_file: bool = False) -> str:
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
    log(f"\nDuration: {result['duration']:.2f}s")
    log(f"Language: {result['language']}")
    log("\n--- TRANSCRIPT ---")
    log(transcript)
    log("--- END TRANSCRIPT ---")

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
    if len(sys.argv) < 2:
        print("Usage: python transcribe_enhanced.py <audio_file> [--save]")
        sys.exit(1)
    audio_file = sys.argv[1]
    save = "--save" in sys.argv
    transcribe_with_output(audio_file, save_to_file=save)