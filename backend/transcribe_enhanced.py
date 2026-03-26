#!/usr/bin/env python3
"""
Enhanced transcription module — v4.

Critical fixes over v3 (based on observed cascade failure):

  PROBLEM: Chunks 7-8 produced underscore text which was blindly fed into
  the context buffer, poisoning every subsequent chunk's initial_prompt.
  Result: chunks 9-22 all hallucinated the identical 517-char block,
  regardless of actual audio content.

  FIX 1 — Context buffer input validation:
    Before any text enters _ContextBuffer, it must pass a plausibility
    check: not garbage (underscores / special chars), not a
    chars-per-second outlier, not a known hallucination pattern.

  FIX 2 — Chars/duration sanity guard:
    Speech produces 3-25 chars/sec. A 1.1s clip producing 349 chars is
    physically impossible and is pure hallucination. Any chunk whose
    output exceeds MAX_CPS_HARD or is below MIN_CPS_SOFT (for long enough
    clips) is rejected before it can pollute the context buffer.

  FIX 3 — Consecutive-output detector:
    A rolling window tracks the last DUPE_WINDOW outputs by hash. If the
    same output appears DUPE_MAX times in a row the chunk is dropped and
    a warning is emitted.

  FIX 4 — Minimum chunk duration:
    Chunks shorter than MIN_CHUNK_S (1.5s) are skipped — they are too
    short for reliable Whisper output and are the primary source of
    garbage that poisons the context buffer.

  FIX 5 — MIN_SILENCE_MS raised to 1500ms:
    The previous 1000ms still produced sub-second chunks in lecture audio.
    1500ms targets true sentence-boundary pauses.

  FIX 6 — Context buffer self-healing:
    If the buffer's own content is detected as garbage (>30% underscores
    or special chars) it resets itself and emits a warning.
"""

import hashlib
import os
import re
import sys
import tempfile
from collections import deque
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CHUNK_S:    float = 25.0   # hard ceiling before Whisper's 30s window
FORCE_SLICE_S:  float = 20.0   # target slice size for long chunks
OVERLAP_CARRY_MS: int = 400     # overlap tail carried between slices

# FIX 5 — raised from 1000 → 1500
MIN_SILENCE_MS:  int   = 1500
SILENCE_THRESH_DB: float = -38.0
KEEP_PADDING_MS:   int   = 300

CONTEXT_WORDS: int = 50   # rolling context window size (words)

# FIX 4 — minimum chunk duration
MIN_CHUNK_S: float = 1.5

# FIX 2 — chars/second plausibility window for speech
MIN_CPS_SOFT: float = 2.0    # below this for clips >3s = suspiciously sparse
MAX_CPS_HARD: float = 30.0   # above this always = hallucination

# FIX 3 — consecutive duplicate detection
DUPE_WINDOW: int = 4   # look-back window
DUPE_MAX:    int = 2   # max times the same output may appear in window

# Pass-2 trigger
NO_SPEECH_PASS2_THRESHOLD: float = 0.55

# Hallucination sentence-loop detector
HALLUCINATION_DOMINANCE_RATIO:         float = 0.65
MIN_SENTENCES_FOR_HALLUCINATION_CHECK: int   = 5   # lowered from 6

MAX_SENTENCE_REPEATS: int = 2
EXPECTED_CPS:         float = 8.0   # for logging only

# ---------------------------------------------------------------------------
# Hallucination regex
# ---------------------------------------------------------------------------

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

# Detects text that is mostly underscores / punctuation / non-alpha
_GARBAGE_RE = re.compile(r"^[\W_\s]+$")


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str, file=None) -> None:
    target = file if file else sys.stdout
    print(msg, file=target)
    target.flush()


def log_warn(msg: str) -> None:
    print(f"[WARN]  {msg}", file=sys.stderr)
    sys.stderr.flush()


def log_error(msg: str) -> None:
    print(f"[ERROR] {msg}", file=sys.stderr)
    sys.stderr.flush()


# ---------------------------------------------------------------------------
# Text plausibility checks  (FIX 1 + FIX 2)
# ---------------------------------------------------------------------------

def _is_garbage_text(text: str) -> bool:
    """Return True if text is underscores, symbols, or mostly non-alpha."""
    if not text or not text.strip():
        return True
    stripped = text.strip()
    if _GARBAGE_RE.match(stripped):
        return True
    alpha_chars = sum(1 for c in stripped if c.isalpha())
    if len(stripped) > 10 and alpha_chars / len(stripped) < 0.40:
        return True
    return False


def _cps_is_plausible(text: str, duration_s: float) -> bool:
    """
    Return True if chars/second is within speech bounds.

    A 1.1s clip producing 349 chars = 317 CPS → hallucination.
    This function catches that before it can poison the context buffer.
    """
    if duration_s <= 0:
        return True   # can't judge, let through
    cps = len(text) / duration_s
    if cps > MAX_CPS_HARD:
        log_warn(f"CPS={cps:.1f} > {MAX_CPS_HARD} — text rejected as hallucination "
                 f"({len(text)} chars in {duration_s:.1f}s)")
        return False
    if duration_s >= 3.0 and cps < MIN_CPS_SOFT and len(text) > 0:
        # Sparse but not zero — still accept, just flag it.
        log(f"    [~] CPS={cps:.1f} < {MIN_CPS_SOFT} (sparse but accepted)")
    return True


def _text_is_safe_for_context(text: str, duration_s: float) -> bool:
    """Gate for whether text may enter the context buffer."""
    if _is_garbage_text(text):
        return False
    if not _cps_is_plausible(text, duration_s):
        return False
    if _is_hallucinated_chunk(text):   # defined below
        return False
    return True


# ---------------------------------------------------------------------------
# Rolling context buffer  (FIX 1 + FIX 6)
# ---------------------------------------------------------------------------

class _ContextBuffer:
    """
    Accumulates confirmed, validated transcribed words and provides the
    last CONTEXT_WORDS of them as an initial_prompt for the next chunk.

    Safety guarantees:
      - update() silently discards garbage / hallucinated text.
      - _self_check() monitors the buffer's own content and resets it if
        it has become garbage (e.g. underscore flood).
    """

    def __init__(self, domain_keywords: Optional[List[str]] = None,
                 max_words: int = CONTEXT_WORDS) -> None:
        self._words: List[str] = []
        self._max:   int       = max_words
        if domain_keywords:
            seed = " ".join(domain_keywords)
            self._words = seed.split()[: self._max]
            log(f"[*] Context buffer seeded with {len(domain_keywords)} keyword(s).")

    def update(self, text: str, duration_s: float = 0.0) -> bool:
        """
        Add text to the buffer only if it passes plausibility checks.
        Returns True if text was accepted, False if rejected.
        """
        if not _text_is_safe_for_context(text, duration_s):
            log_warn(f"Context buffer rejected chunk text "
                     f"({len(text)} chars, {duration_s:.1f}s).")
            return False

        new_words = text.split()
        self._words.extend(new_words)
        if len(self._words) > self._max:
            self._words = self._words[-self._max :]

        self._self_check()
        return True

    def _self_check(self) -> None:
        """FIX 6 — reset buffer if its own content has become garbage."""
        if not self._words:
            return
        content = " ".join(self._words)
        if _is_garbage_text(content):
            log_warn("Context buffer became garbage — resetting.")
            self._words = []

    def prompt(self) -> Optional[str]:
        if not self._words:
            return None
        return " ".join(self._words)


# ---------------------------------------------------------------------------
# Consecutive-output duplicate detector  (FIX 3)
# ---------------------------------------------------------------------------

class _DupeDetector:
    """
    Tracks a rolling window of recent chunk output hashes.
    If the same output appears DUPE_MAX times within DUPE_WINDOW chunks,
    the output is flagged as a hallucination loop.
    """

    def __init__(self, window: int = DUPE_WINDOW, max_dupes: int = DUPE_MAX) -> None:
        self._window:    deque   = deque(maxlen=window)
        self._max_dupes: int     = max_dupes

    def _hash(self, text: str) -> str:
        return hashlib.md5(text.encode()).hexdigest()

    def is_duplicate(self, text: str) -> bool:
        if not text:
            return False
        h = self._hash(text)
        count = sum(1 for x in self._window if x == h)
        return count >= self._max_dupes

    def record(self, text: str) -> None:
        self._window.append(self._hash(text))


# ---------------------------------------------------------------------------
# Force-slice helper
# ---------------------------------------------------------------------------

def _force_slice_chunk(audio_segment, start_ms: int, end_ms: int,
                       slice_ms: int) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    pos   = 0
    total = end_ms - start_ms

    while pos < total:
        seg_start = pos
        seg_end   = min(pos + slice_ms, total)
        carry_end = min(seg_end + OVERLAP_CARRY_MS, total)

        chunk_audio = audio_segment[seg_start:carry_end]

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            chunk_audio.export(tmp.name, format="wav")
            results.append({
                "path":     tmp.name,
                "start_ms": start_ms + seg_start,
                "end_ms":   start_ms + seg_end,
                "carry_ms": OVERLAP_CARRY_MS if carry_end > seg_end else 0,
            })
        pos = seg_end

    return results


# ---------------------------------------------------------------------------
# Silence-based chunking
# ---------------------------------------------------------------------------

def _split_by_silence(audio_path: str) -> List[Dict[str, Any]]:
    from pydub import AudioSegment
    from pydub.silence import split_on_silence

    audio    = AudioSegment.from_file(audio_path)
    max_ms   = int(MAX_CHUNK_S   * 1000)
    slice_ms = int(FORCE_SLICE_S * 1000)
    min_ms   = int(MIN_CHUNK_S   * 1000)

    raw_chunks = split_on_silence(
        audio,
        min_silence_len=MIN_SILENCE_MS,
        silence_thresh=SILENCE_THRESH_DB,
        keep_silence=KEEP_PADDING_MS,
    )

    if not raw_chunks:
        log_warn("split_on_silence returned nothing — treating entire file as one chunk.")
        raw_chunks = [audio]

    result: List[Dict[str, Any]] = []
    current_pos = 0
    skipped_short = 0

    for i, chunk in enumerate(raw_chunks):
        chunk_len = len(chunk)
        start_ms  = current_pos
        end_ms    = start_ms + chunk_len

        # FIX 4 — skip chunks that are too short to produce reliable output
        if chunk_len < min_ms:
            skipped_short += 1
            current_pos = end_ms
            continue

        if chunk_len > max_ms:
            log_warn(f"Chunk {i+1}: {chunk_len/1000:.1f}s > {MAX_CHUNK_S}s — force-slicing.")
            result.extend(_force_slice_chunk(chunk, start_ms, end_ms, slice_ms))
        else:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                chunk.export(tmp.name, format="wav")
                result.append({
                    "path":     tmp.name,
                    "start_ms": start_ms,
                    "end_ms":   end_ms,
                    "carry_ms": 0,
                })

        current_pos = end_ms

    if skipped_short:
        log(f"[*] Skipped {skipped_short} chunk(s) shorter than {MIN_CHUNK_S}s")
    log(f"[+] {len(result)} chunk(s) after silence-split + force-slice")
    return result


# ---------------------------------------------------------------------------
# Overlap-aware merge
# ---------------------------------------------------------------------------

def _resolve_boundary(prev_text: str, next_text: str,
                      max_overlap_words: int = 8) -> str:
    if not prev_text or not next_text:
        return next_text
    prev_words = prev_text.split()
    next_words = next_text.split()
    for n in range(min(max_overlap_words, len(prev_words), len(next_words)), 0, -1):
        if prev_words[-n:] == next_words[:n]:
            return " ".join(next_words[n:])
    return next_text


def _merge_chunks(chunk_results: List[Dict]) -> str:
    if not chunk_results:
        return ""
    if len(chunk_results) == 1:
        return chunk_results[0]["text"]

    merged = chunk_results[0]["text"]
    for i in range(1, len(chunk_results)):
        curr      = chunk_results[i]
        next_text = curr.get("text", "").strip()
        if not next_text:
            continue
        if curr.get("carry_ms", 0) > 0:
            next_text = _resolve_boundary(merged, next_text)
        if next_text:
            merged = merged.rstrip() + " " + next_text
    return merged.strip()


# ---------------------------------------------------------------------------
# Sentence-level deduplication
# ---------------------------------------------------------------------------

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
    kept:   List[str]      = []
    for sent in sentences:
        key = re.sub(r"[\s.!?,;:]+$", "", sent.lower().strip())
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
        if counts[key] <= max_repeats:
            kept.append(sent)
    return " ".join(kept)


def _is_hallucinated_chunk(text: str) -> bool:
    """Detect sentence-loop hallucinations."""
    if not text or len(text) < 20:
        return False
    sentences = _split_sentences(text)
    if len(sentences) < MIN_SENTENCES_FOR_HALLUCINATION_CHECK:
        return False
    counts: Dict[str, int] = {}
    for sent in sentences:
        key = re.sub(r"[\s.!?,;:]+$", "", sent.lower().strip())
        if key:
            counts[key] = counts.get(key, 0) + 1
    if not counts:
        return False
    most_common = max(counts.values())
    dominance   = most_common / len(sentences)
    if dominance >= HALLUCINATION_DOMINANCE_RATIO:
        log(f"    [!] Hallucination loop: one sentence repeats "
            f"{most_common}/{len(sentences)} times ({dominance:.0%}).")
        return True
    return False


# ---------------------------------------------------------------------------
# Post-processing
# ---------------------------------------------------------------------------

def _postprocess(text: str) -> str:
    if not text:
        return text
    text = _HALLUCINATION_RE.sub("", text)
    text = _REPEATED_WORD_RE.sub(lambda m: m.group(1), text)
    text = _dedup_sentences(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Single-chunk transcription
# ---------------------------------------------------------------------------

def _transcribe_chunk(
    model,
    audio_path: str,
    no_speech_threshold: float,
    log_prob_threshold: float,
    temperature,
    initial_prompt: Optional[str],
) -> Tuple[List[str], Any, int, float]:
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
            min_speech_duration_ms=400,
            max_speech_duration_s=24.0,
        ),
    )

    parts:         List[str] = []
    rejected:      int       = 0
    no_speech_sum: float     = 0.0
    total_segs:    int       = 0

    for seg in segments_iter:
        total_segs    += 1
        no_speech_sum += seg.no_speech_prob
        text = seg.text.strip()
        if not text:
            continue
        if seg.no_speech_prob > no_speech_threshold:
            rejected += 1
            continue
        parts.append(text)

    avg_no_speech = (no_speech_sum / total_segs) if total_segs > 0 else 0.0
    return parts, info, rejected, avg_no_speech


# ---------------------------------------------------------------------------
# Main transcription API
# ---------------------------------------------------------------------------

def transcribe_file(
    file_path: str,
    model_name: Optional[str] = None,
    domain_keywords: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Transcribe an audio file.

    Args:
        file_path:        Path to audio file.
        model_name:       Whisper model name (default: medium).
        domain_keywords:  Optional list of domain-specific terms to prime
                          Whisper's vocabulary from the very first chunk.

    Returns:
        dict: transcript, duration, language, error.
    """
    try:
        import faster_whisper
    except ImportError:
        log_error("faster-whisper not installed.")
        return {"error": "faster-whisper not installed.", "transcript": "", "duration": 0}

    if not os.path.exists(file_path):
        msg = f"File not found: {file_path}"
        log_error(msg)
        return {"error": msg, "transcript": "", "duration": 0}

    if model_name is None:
        model_name = os.getenv("TRANSCRIBER_MODEL", "medium")

    device  = os.getenv("TRANSCRIBER_DEVICE", "cuda")
    compute = "int8"

    log(f"[*] Loading Whisper '{model_name}' on {device} ({compute})...")

    try:
        model = faster_whisper.WhisperModel(model_name, device=device,
                                            compute_type=compute)
        log(f"[+] Model loaded on {device}")
    except Exception as e:
        log(f"[!] GPU failed ({e}), falling back to CPU...")
        model = faster_whisper.WhisperModel(model_name, device="cpu",
                                            compute_type="int8")
        log("[+] Model loaded on CPU")

    try:
        from pydub import AudioSegment
        audio            = AudioSegment.from_file(file_path)
        total_duration_s = len(audio) / 1000
        log(f"[*] Audio: {total_duration_s:.1f}s ({total_duration_s/60:.1f} min)")
    except Exception as e:
        log(f"[!] Could not determine audio duration: {e}")
        total_duration_s = 0

    log("[*] Splitting audio by silence...")
    chunks = _split_by_silence(file_path)

    for idx, c in enumerate(chunks):
        dur_s = (c["end_ms"] - c["start_ms"]) / 1000
        if dur_s > MAX_CHUNK_S:
            log_warn(f"Chunk {idx+1} is still {dur_s:.1f}s — check audio format.")

    # State trackers
    context = _ContextBuffer(domain_keywords=domain_keywords)
    dupes   = _DupeDetector()

    all_parts:     List[Dict] = []
    total_rejected: int       = 0
    n_hallucinated: int       = 0
    n_dupe_dropped: int       = 0

    for i, chunk in enumerate(chunks):
        dur_s  = (chunk["end_ms"] - chunk["start_ms"]) / 1000
        prompt = context.prompt()

        log(f"\n[*] Chunk {i+1}/{len(chunks)} — {dur_s:.1f}s "
            f"[{chunk['start_ms']/1000:.1f}s -> {chunk['end_ms']/1000:.1f}s]"
            + (f" | ctx: ...{prompt[-60:]!r}" if prompt else " | no ctx yet"))

        # ------------------------------------------------------------------
        # Pass 1
        # ------------------------------------------------------------------
        parts1, _, rej1, avg_ns1 = _transcribe_chunk(
            model,
            chunk["path"],
            no_speech_threshold=0.80,
            log_prob_threshold=-1.5,
            temperature=0.0,
            initial_prompt=prompt,
        )
        raw1 = " ".join(parts1).strip()

        # --- Hallucination / garbage / CPS guards -------------------------
        if _is_garbage_text(raw1):
            log(f"    [!] Pass-1 rejected: garbage text")
            raw1 = ""
        elif not _cps_is_plausible(raw1, dur_s):
            log(f"    [!] Pass-1 rejected: CPS out of bounds")
            raw1 = ""
        elif _is_hallucinated_chunk(raw1):
            log(f"    [!] Pass-1 rejected: sentence-loop hallucination")
            raw1    = ""
            avg_ns1 = 1.0

        # --- Consecutive duplicate guard ----------------------------------
        if raw1 and dupes.is_duplicate(raw1):
            log(f"    [!] Pass-1 rejected: same output as recent chunk(s) — "
                f"hallucination loop")
            raw1 = ""
            n_dupe_dropped += 1

        log(f"    Pass-1: {len(raw1)} chars, "
            f"avg no_speech={avg_ns1:.2f}, rejected={rej1}")

        # ------------------------------------------------------------------
        # Pass 2
        # ------------------------------------------------------------------
        raw      = raw1
        rejected = rej1

        if avg_ns1 > NO_SPEECH_PASS2_THRESHOLD:
            log(f"    avg no_speech {avg_ns1:.2f} > {NO_SPEECH_PASS2_THRESHOLD}"
                f" — trying Pass 2...")
            parts2, _, rej2, avg_ns2 = _transcribe_chunk(
                model,
                chunk["path"],
                no_speech_threshold=0.65,
                log_prob_threshold=-1.8,
                temperature=[0.0, 0.2],
                initial_prompt=prompt,
            )
            raw2 = " ".join(parts2).strip()

            p2_ok = (
                not _is_garbage_text(raw2)
                and _cps_is_plausible(raw2, dur_s)
                and not _is_hallucinated_chunk(raw2)
                and not dupes.is_duplicate(raw2)
                and len(raw2) > len(raw1)
            )
            if p2_ok:
                log(f"    Pass-2 accepted: {len(raw2)} chars")
                raw      = raw2
                rejected = rej2
            else:
                log(f"    Pass-2 rejected. Keeping Pass-1.")

        # ------------------------------------------------------------------
        # Record output hash (even if empty, to track blank-output loops)
        # ------------------------------------------------------------------
        dupes.record(raw)

        # ------------------------------------------------------------------
        # Update context buffer — validated inside update()
        # ------------------------------------------------------------------
        if raw:
            accepted = context.update(raw, duration_s=dur_s)
            if not accepted:
                n_hallucinated += 1

        all_parts.append({
            "text":     raw,
            "start_ms": chunk["start_ms"],
            "end_ms":   chunk["end_ms"],
            "carry_ms": chunk.get("carry_ms", 0),
        })
        total_rejected += rejected
        log(f"    [+] Final: {len(raw)} chars, {rejected} rejected segments")

    # Merge
    log("\n[*] Merging chunks with overlap resolution...")
    raw_merged = _merge_chunks(all_parts)

    # Post-process
    clean         = _postprocess(raw_merged)
    removed_chars = len(raw_merged) - len(clean)
    if removed_chars > 0:
        log(f"[*] Post-processing removed {removed_chars} chars")

    log(f"\n[*] Done.")
    log(f"    Chunks processed      : {len(chunks)}")
    log(f"    Total seg rejected    : {total_rejected}")
    log(f"    Ctx buffer rejections : {n_hallucinated}")
    log(f"    Dupe-loop drops       : {n_dupe_dropped}")
    log(f"    Transcript length     : {len(clean)} chars")
    if total_duration_s > 0:
        log(f"    Chars/sec            : {len(clean)/max(total_duration_s,1):.2f}")

    for chunk in chunks:
        if chunk["path"] != file_path and os.path.exists(chunk["path"]):
            try:
                os.unlink(chunk["path"])
            except Exception:
                pass

    return {
        "transcript": clean,
        "duration":   total_duration_s,
        "language":   "en",
        "error":      None,
    }


# ---------------------------------------------------------------------------
# Public convenience wrapper
# ---------------------------------------------------------------------------

def transcribe_with_output(
    audio_path: str,
    save_to_file: bool = False,
    domain_keywords: Optional[List[str]] = None,
) -> str:
    log("=" * 60)
    log("TRANSCRIPTION START")
    log("=" * 60)

    result = transcribe_file(audio_path, domain_keywords=domain_keywords)

    log("\n" + "=" * 60)
    log("TRANSCRIPTION RESULT")
    log("=" * 60)

    if result.get("error"):
        log_error(f"Transcription failed: {result['error']}")
        return ""

    transcript = result.get("transcript", "")

    log(f"\nDuration : {result['duration']:.2f}s")
    log(f"Language : {result['language']}")
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
            log_error(f"Failed to save: {e}")

    return transcript


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Lecture transcription v4")
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--save", action="store_true",
                        help="Save transcript to .txt file")
    parser.add_argument("--keywords", nargs="*", default=None,
                        help="Domain keywords to prime Whisper vocabulary")
    args = parser.parse_args()

    transcribe_with_output(
        args.audio,
        save_to_file=args.save,
        domain_keywords=args.keywords,
    )