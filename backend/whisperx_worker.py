"""
WhisperX subprocess worker — runs under Python 3.13 in venv_whisperx.

Protocol (JSON over stdin/stdout, one JSON object per line):
─────────────────────────────────────────────────────────────
Request  → {"cmd": "transcribe", "audio_b64": "<base64>", "sr": 16000}
         → {"cmd": "ping"}
         → {"cmd": "shutdown"}

Response ← {"ok": true, "text": "...", "segments": [...], "language": "en"}
         ← {"ok": true, "pong": true}
         ← {"ok": false, "error": "..."}

Each segment:
  {"text": "...", "start": 0.0, "end": 1.5, "words": [{"word": "...", "start": 0.1, "end": 0.3}, ...]}
"""

from __future__ import annotations

import base64
import gc
import json
import os
import sys
import traceback
import warnings

# ══════════════════════════════════════════════════════════════════════════
# CRITICAL: Redirect stdout to stderr during imports.
# Some libraries (torchcodec, pyannote) print warnings to stdout, which
# would corrupt our JSON protocol.  We temporarily swap stdout with stderr
# and also force all Python warnings to stderr.
# ══════════════════════════════════════════════════════════════════════════
_real_stdout = sys.stdout          # save the real stdout for JSON responses
sys.stdout = sys.stderr            # redirect everything else to stderr
warnings.showwarning = lambda msg, cat, fn, lineno, file=None, line=None: \
    print(f"WARNING: {cat.__name__}: {msg}", file=sys.stderr, flush=True)

import numpy as np

# ── Load WhisperX ──────────────────────────────────────────────────────────
import whisperx

# Restore stdout now that imports are done
sys.stdout = _real_stdout


def _get_env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None or raw_value.strip() == "":
        return default
    return int(raw_value)


def _get_env_float(name: str, default: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None or raw_value.strip() == "":
        return default
    return float(raw_value)


# Configuration from environment
DEVICE = os.getenv("WHISPERX_DEVICE", "cpu")  # "cuda" or "cpu"
MODEL_SIZE = os.getenv("WHISPERX_MODEL", "large-v3")
TASK = os.getenv("WHISPERX_TASK", "translate").strip().lower() or "translate"
LANGUAGE = (os.getenv("WHISPERX_LANGUAGE") or "").strip().lower() or None
COMPUTE_TYPE = os.getenv(
    "WHISPERX_COMPUTE",
    "float16" if DEVICE == "cuda" else "int8",
)  # "float16" for GPU, "int8" for CPU
BATCH_SIZE = _get_env_int(
    "WHISPERX_BATCH_SIZE",
    8 if DEVICE != "cuda" and MODEL_SIZE.startswith("large") else 16,
)
DOWNLOAD_ROOT = (os.getenv("WHISPERX_DOWNLOAD_ROOT") or os.getenv("HF_HUB_CACHE") or "").strip() or None
ENABLE_ALIGNMENT = TASK != "translate" and os.getenv("WHISPERX_ALIGN", "1").strip().lower() not in {"0", "false", "no"}
MIN_SEGMENT_AVG_LOGPROB = _get_env_float("WHISPERX_MIN_SEGMENT_AVG_LOGPROB", -0.65)

ASR_OPTIONS = {
    "beam_size": _get_env_int("WHISPERX_BEAM_SIZE", 8),
    "best_of": _get_env_int("WHISPERX_BEST_OF", 8),
    "patience": _get_env_float("WHISPERX_PATIENCE", 1.5),
    "length_penalty": _get_env_float("WHISPERX_LENGTH_PENALTY", 1.0),
    "repetition_penalty": _get_env_float("WHISPERX_REPETITION_PENALTY", 1.08),
    "no_repeat_ngram_size": _get_env_int("WHISPERX_NO_REPEAT_NGRAM_SIZE", 3),
    "compression_ratio_threshold": _get_env_float("WHISPERX_COMPRESSION_RATIO_THRESHOLD", 1.8),
    "log_prob_threshold": _get_env_float("WHISPERX_LOG_PROB_THRESHOLD", -0.6),
    "no_speech_threshold": _get_env_float("WHISPERX_NO_SPEECH_THRESHOLD", 0.72),
    "hallucination_silence_threshold": _get_env_float("WHISPERX_HALLUCINATION_SILENCE_THRESHOLD", 0.8),
    "condition_on_previous_text": False,
    "initial_prompt": os.getenv(
        "WHISPERX_INITIAL_PROMPT",
        "Translate all speech into concise, natural English. Return only the spoken content with no filler additions.",
    ),
}

VAD_OPTIONS = {
    "vad_onset": _get_env_float("WHISPERX_VAD_ONSET", 0.62),
    "vad_offset": _get_env_float("WHISPERX_VAD_OFFSET", 0.45),
    "chunk_size": _get_env_int("WHISPERX_VAD_CHUNK_SIZE", 20),
}

# ── Globals ────────────────────────────────────────────────────────────────
_model = None
_align_model = None
_align_metadata = None


def _log(msg: str):
    """Write log to stderr (stdout is reserved for JSON protocol)."""
    print(f"[whisperx_worker] {msg}", file=sys.stderr, flush=True)


def _load_model():
    global _model
    if _model is not None:
        return
    language_label = LANGUAGE or "auto"
    _log(
        f"Loading WhisperX model '{MODEL_SIZE}' on {DEVICE} "
        f"(compute={COMPUTE_TYPE}, task={TASK}, language={language_label})..."
    )
    # Protect stdout during model loading (libraries may print to stdout)
    _saved = sys.stdout
    sys.stdout = sys.stderr
    try:
        _model = whisperx.load_model(
            MODEL_SIZE,
            DEVICE,
            compute_type=COMPUTE_TYPE,
            task=TASK,
            language=LANGUAGE,
            asr_options=ASR_OPTIONS,
            vad_options=VAD_OPTIONS,
            download_root=DOWNLOAD_ROOT,
        )
    finally:
        sys.stdout = _saved
    _log("Model loaded ✓")


def _load_align_model():
    global _align_model, _align_metadata
    if not ENABLE_ALIGNMENT or _align_model is not None or LANGUAGE is None:
        return
    _log(f"Loading alignment model for language '{LANGUAGE}'...")
    _saved = sys.stdout
    sys.stdout = sys.stderr
    try:
        _align_model, _align_metadata = whisperx.load_align_model(
            language_code=LANGUAGE,
            device=DEVICE,
        )
    finally:
        sys.stdout = _saved
    _log("Alignment model loaded ✓")


def _respond(obj: dict):
    """Write a single JSON line to stdout."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def handle_transcribe(payload: dict) -> dict:
    """Transcribe audio and return segments with word-level timestamps."""
    _load_model()

    # Decode audio from base64
    audio_bytes = base64.b64decode(payload["audio_b64"])
    sr = payload.get("sr", 16000)
    audio = np.frombuffer(audio_bytes, dtype=np.float32)

    # Protect stdout during all WhisperX calls
    _saved = sys.stdout
    sys.stdout = sys.stderr

    try:
        # 1. Transcribe (batched)
        result = _model.transcribe(audio, batch_size=BATCH_SIZE, language=LANGUAGE, task=TASK)

        segments = result.get("segments", [])
        language = result.get("language", LANGUAGE or "unknown")

        if not segments:
            return {"ok": True, "text": "", "segments": [], "language": language}

        # 2. Align for word-level timestamps
        try:
            if LANGUAGE is None:
                detected_language = (language or "").strip().lower() or None
                if detected_language and detected_language != "en":
                    _log(f"Detected source language '{detected_language}' for English translation")
                if ENABLE_ALIGNMENT and detected_language:
                    globals()["LANGUAGE"] = detected_language
            _load_align_model()
            if ENABLE_ALIGNMENT and _align_model is not None and _align_metadata is not None:
                result = whisperx.align(
                    segments,
                    _align_model,
                    _align_metadata,
                    audio,
                    DEVICE,
                    return_char_alignments=False,
                )
                segments = result.get("segments", segments)
        except Exception as e:
            _log(f"Alignment failed (non-fatal): {e}")

    finally:
        sys.stdout = _saved

    filtered_segments = []
    for seg in segments:
        text = seg.get("text", "").strip()
        avg_logprob = seg.get("avg_logprob")
        if not text:
            continue
        if avg_logprob is not None and avg_logprob < MIN_SEGMENT_AVG_LOGPROB:
            _log(f"Dropping low-confidence segment (avg_logprob={avg_logprob:.2f}): {text!r}")
            continue
        filtered_segments.append(seg)

    segments = filtered_segments

    # Build response
    full_text = " ".join(seg.get("text", "").strip() for seg in segments).strip()

    clean_segments = []
    for seg in segments:
        clean_seg = {
            "text": seg.get("text", "").strip(),
            "start": seg.get("start", 0.0),
            "end": seg.get("end", 0.0),
            "avg_logprob": seg.get("avg_logprob"),
        }
        # Include word-level timestamps if available
        words = seg.get("words", [])
        if words:
            clean_seg["words"] = [
                {
                    "word": w.get("word", ""),
                    "start": w.get("start", 0.0),
                    "end": w.get("end", 0.0),
                }
                for w in words
            ]
        clean_segments.append(clean_seg)

    return {
        "ok": True,
        "text": full_text,
        "segments": clean_segments,
        "language": language,
    }


def main():
    _log("Worker starting...")
    _log(
        f"Config: model={MODEL_SIZE}, task={TASK}, language={LANGUAGE or 'auto'}, "
        f"device={DEVICE}, compute={COMPUTE_TYPE}, batch={BATCH_SIZE}, align={ENABLE_ALIGNMENT}"
    )

    # The ASR model must load successfully before the worker can accept work.
    try:
        _load_model()
    except Exception as e:
        _log(f"Fatal: model pre-load failed: {e}")
        _respond({"ok": False, "ready": False, "error": str(e)})
        sys.exit(1)

    # Alignment improves timestamps for same-language transcription only.
    if ENABLE_ALIGNMENT and LANGUAGE is not None:
        try:
            _load_align_model()
        except Exception as e:
            _log(f"Warning: alignment pre-load failed: {e}")

    _respond({"ok": True, "ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
        except json.JSONDecodeError as e:
            _respond({"ok": False, "error": f"Invalid JSON: {e}"})
            continue

        cmd = payload.get("cmd", "")

        try:
            if cmd == "ping":
                _respond({"ok": True, "pong": True})

            elif cmd == "transcribe":
                result = handle_transcribe(payload)
                _respond(result)

            elif cmd == "shutdown":
                _log("Shutdown requested")
                _respond({"ok": True, "shutdown": True})
                break

            else:
                _respond({"ok": False, "error": f"Unknown command: {cmd}"})

        except Exception as e:
            _log(f"Error handling '{cmd}': {traceback.format_exc()}")
            _respond({"ok": False, "error": str(e)})

    _log("Worker exiting.")


if __name__ == "__main__":
    main()
