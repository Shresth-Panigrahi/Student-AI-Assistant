"""
Audio Transcriber V4 — WhisperX-powered transcription with word-level timestamps.

Architecture: The main backend runs on Python 3.14, while WhisperX requires
Python <3.14. This module bridges the gap by spawning a subprocess worker
(whisperx_worker.py) running under a Python 3.13 venv, communicating via
JSON-per-line over stdin/stdout.

Key improvements over V2:
    - WhisperX batched inference (faster than sequential faster-whisper)
    - Word-level timestamps via forced alignment (Wav2Vec2)
    - Optional speaker diarization (requires HF_TOKEN)
    - All existing V2 hallucination filtering is preserved

API (drop-in compatible with V2):
    from audio_transcriber_v4 import get_transcriber_v4 as get_transcriber
    from audio_transcriber_v4 import is_whisperx_available as is_whisper_available

    transcriber = get_transcriber()
    transcriber.start_recording(callback)
    transcriber.stop_recording()
"""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from collections import deque
from pathlib import Path
from typing import Callable, List, Optional

import numpy as np
import sounddevice as sd
from dotenv import load_dotenv

load_dotenv()

# ── Locate the WhisperX venv Python interpreter ──────────────────────────
BACKEND_DIR = Path(os.getenv("LECTURE_LYFT_RUNTIME_BACKEND_DIR", Path(__file__).resolve().parent)).resolve()
WHISPERX_VENV = BACKEND_DIR / "venv_whisperx"
DEFAULT_RUNTIME_CACHE_DIR = Path(
    os.getenv("LECTURE_LYFT_CACHE_DIR", str(Path.home() / ".lecture-lyft-runtime"))
).expanduser()
DEFAULT_RUNTIME_TEMP_DIR = Path(tempfile.gettempdir()) / "lecture-lyft-runtime"


def _coerce_runtime_path(raw_path: str, preserve_symlinks: bool = False) -> Path:
    path_obj = Path(raw_path).expanduser()
    if not path_obj.is_absolute():
        path_obj = BACKEND_DIR / path_obj
    if preserve_symlinks:
        return path_obj
    return path_obj.resolve()


WHISPERX_PYTHON = _coerce_runtime_path(
    os.getenv(
        "LECTURE_LYFT_WHISPERX_PYTHON",
        str(WHISPERX_VENV / ("Scripts" if os.name == "nt" else "bin") / ("python.exe" if os.name == "nt" else "python")),
    ),
    preserve_symlinks=True,
)
WHISPERX_WORKER = _coerce_runtime_path(
    os.getenv("LECTURE_LYFT_WHISPERX_WORKER", str(BACKEND_DIR / "whisperx_worker.py"))
)

WHISPERX_AVAILABLE = WHISPERX_VENV.exists() and WHISPERX_PYTHON.exists() and WHISPERX_WORKER.exists()

if WHISPERX_AVAILABLE:
    print("✅ WhisperX venv found at:", WHISPERX_VENV)
    print("✅ WhisperX interpreter:", WHISPERX_PYTHON)
else:
    missing = []
    if not WHISPERX_VENV.exists():
        missing.append("venv_whisperx/")
    if not WHISPERX_PYTHON.exists():
        missing.append(str(WHISPERX_PYTHON))
    if not WHISPERX_WORKER.exists():
        missing.append("whisperx_worker.py")
    print(f"⚠️  WhisperX not available (missing: {', '.join(missing)})")

# Try to import course_prompts for dynamic topic-based prompts
try:
    from course_prompts import (
        build_generic_leak_patterns,
        build_initial_prompt,
        build_leak_patterns,
        generate_keywords,
    )
    COURSE_PROMPTS_AVAILABLE = True
except ImportError:
    COURSE_PROMPTS_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════════════════
# HALLUCINATION FILTERING — carried from V2 unchanged
# ═══════════════════════════════════════════════════════════════════════════

HALLUCINATION_PATTERNS = [
    r"thank you for watching", r"thanks for watching", r"please subscribe",
    r"like and subscribe", r"don't forget to subscribe", r"hit the bell",
    r"click the link", r"see you in the next", r"see you next time",
    r"bye[\s\-]*bye", r"goodbye", r"smash the like button", r"leave a comment",
    r"♪", r"🎵", r"\[music\]", r"\[applause\]", r"\[laughter\]",
    r"\[silence\]", r"\[inaudible\]", r"\[background music\]",
    r"\[coughing\]", r"\[cough\]",
    r"字幕", r"ご視聴", r"視聴", r"الحمد", r"بسم الله", r"이 비디오", r"구독",
    r"^(.{2,30})\s+\1{2,}$",
    r"^(um+|uh+|ah+|oh+|hmm+|er+|ahem+)[\s\.]*$",
    r"^\.+$", r"^\s*$",
    r"^you$", r"^\.{2,}$", r"^I'm going to", r"^So,?\s*$",
    r"^And,?\s*$", r"^The\s*$", r"^It's\s*$", r"^Okay,?\s*$",
    r"^Right,?\s*$", r"^Yes,?\s*$", r"^No,?\s*$",
    r"^Well,?\s*$", r"^Now,?\s*$",
    r"^alright[\s,.]*$", r"^moving on[\s,.]*$", r"^next slide[\s,.]*$",
    r"^as you can see[\s,.]*$", r"^let's look at[\s,.]*$",
    r"^if we look[\s,.]*$", r"^here we have[\s,.]*$",
    r"^this is called[\s,.]*$", r"^in this case[\s,.]*$",
    r"^essentially[\s,.]*$", r"^basically[\s,.]*$",
    r"\b([a-zA-Z])(?:[-\s]?\1){3,}\b",
    r"\b(\w+)(?:\s+\1){3,}\b",
    r"technical terms include", r"the professor may reference",
    r"this is a lecture", r"lecture transcription",
    r"academic lecture", r"this is an academic",
]

COMPILED_HALLUCINATION_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in HALLUCINATION_PATTERNS
]


def is_hallucination(text: str, extra_patterns: Optional[List[re.Pattern]] = None) -> bool:
    text_stripped = text.strip()
    if len(text_stripped) < 3:
        return True
    for pattern in COMPILED_HALLUCINATION_PATTERNS:
        if pattern.search(text_stripped):
            return True
    if extra_patterns:
        for pattern in extra_patterns:
            if pattern.search(text_stripped):
                return True
    alphanumeric = re.sub(r'[^a-zA-Z0-9]', '', text_stripped)
    if len(alphanumeric) < 2:
        return True
    words = text_stripped.lower().split()
    if len(words) >= 4:
        word_counts: dict = {}
        for w in words:
            word_counts[w] = word_counts.get(w, 0) + 1
        if max(word_counts.values()) / len(words) > 0.7:
            return True
    return False


def strip_repetitions(text: str) -> str:
    text = text.strip()
    if re.search(r'_{3,}', text):
        cleaned = re.sub(r'\s*_{3,}\s*', ' ', text).strip()
        text = cleaned if cleaned and len(cleaned) > 5 else ""
    if re.search(r'-{5,}', text):
        cleaned = re.sub(r'\s*-{5,}\s*', ' ', text).strip()
        text = cleaned if cleaned and len(cleaned) > 5 else ""
    words = text.split()
    if len(words) < 6:
        return text
    for n in [3, 2]:
        if len(words) < n * 2:
            continue
        ngrams = [' '.join(words[i:i+n]) for i in range(len(words) - n + 1)]
        ngram_counts: dict = {}
        for ng in ngrams:
            ngram_counts[ng.lower()] = ngram_counts.get(ng.lower(), 0) + 1
        most_common_count = max(ngram_counts.values())
        if most_common_count >= 3:
            repeated_phrase = max(ngram_counts, key=ngram_counts.get)
            result = []
            i = 0
            seen = False
            while i < len(words):
                if i + n <= len(words):
                    current = ' '.join(w.lower() for w in words[i:i+n])
                    if current == repeated_phrase:
                        if not seen:
                            result.extend(words[i:i+n])
                            seen = True
                        i += n
                        continue
                result.append(words[i])
                i += 1
            cleaned = ' '.join(result).strip()
            if cleaned and len(cleaned) > 3:
                return cleaned
    return text


def detect_immediate_repetition(text: str) -> str:
    if not text or not text.strip():
        return text
    text = text.strip()
    words = text.split()
    if len(words) < 4:
        return text
    word_counts: dict = {}
    for word in words:
        clean_word = re.sub(r'[^\w]', '', word.lower())
        if clean_word:
            word_counts[clean_word] = word_counts.get(clean_word, 0) + 1
    if word_counts:
        max_count = max(word_counts.values())
        if max_count >= 3 and max_count / len(words) > 0.4:
            repeated_word = max(word_counts, key=word_counts.get)
            unique_words = len([w for w in word_counts.values() if w > 0])
            if unique_words == 1:
                return ""
            else:
                cleaned_words = []
                skipped = 0
                for word in words:
                    clean_word = re.sub(r'[^\w]', '', word.lower())
                    if clean_word == repeated_word and skipped < max_count - 1:
                        skipped += 1
                        continue
                    cleaned_words.append(word)
                if cleaned_words:
                    result = ' '.join(cleaned_words).strip()
                    if result and len(result) > 5:
                        return result
    for phrase_len in [3, 2]:
        if len(words) < phrase_len * 2:
            continue
        phrases = [' '.join(words[i:i+phrase_len]).lower() for i in range(len(words) - phrase_len + 1)]
        phrase_counts: dict = {}
        for phrase in phrases:
            normalized = re.sub(r'[^\w\s]', '', phrase)
            if normalized:
                phrase_counts[normalized] = phrase_counts.get(normalized, 0) + 1
        if phrase_counts:
            max_phrase_count = max(phrase_counts.values())
            if max_phrase_count >= 3:
                repeated_phrase = max(phrase_counts, key=phrase_counts.get)
                repeated_words_in_text = max_phrase_count * phrase_len
                if repeated_words_in_text / len(words) > 0.5:
                    return ""
    if len(words) >= 6:
        normalized = [re.sub(r'[^\w]', '', w.lower()) for w in words if re.sub(r'[^\w]', '', w.lower())]
        if len(normalized) >= 6:
            is_alternating = True
            for i in range(len(normalized) - 2):
                if normalized[i] == normalized[i+2] and normalized[i] != normalized[i+1]:
                    continue
                else:
                    is_alternating = False
                    break
            if is_alternating:
                return ""
    return text


def calculate_audio_energy(audio_data: np.ndarray) -> float:
    return float(np.sqrt(np.mean(audio_data ** 2)))


# ═══════════════════════════════════════════════════════════════════════════
# REALTIME REPETITION DETECTOR — carried from V2 unchanged
# ═══════════════════════════════════════════════════════════════════════════

def _normalize_for_comparison(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _split_into_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?;])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _word_jaccard(a: str, b: str) -> float:
    sa = set(a.split())
    sb = set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


class RealtimeRepetitionDetector:
    def __init__(self, window_size: int = 60, similarity_threshold: float = 0.72, min_sentence_words: int = 4):
        self._window: deque = deque(maxlen=window_size)
        self._threshold = similarity_threshold
        self._min_words = min_sentence_words
        self._stats = {"checked": 0, "removed": 0, "chunks_modified": 0}

    def filter(self, text: str) -> str:
        if not text or not text.strip():
            return text
        sentences = _split_into_sentences(text)
        kept = []
        any_removed = False
        for sentence in sentences:
            norm = _normalize_for_comparison(sentence)
            self._stats["checked"] += 1
            if self._is_duplicate(norm):
                self._stats["removed"] += 1
                any_removed = True
            else:
                kept.append(sentence)
                self._window.append(norm)
        if any_removed:
            self._stats["chunks_modified"] += 1
        return " ".join(kept) if kept else ""

    def reset(self):
        self._window.clear()
        self._stats = {"checked": 0, "removed": 0, "chunks_modified": 0}

    def get_stats(self) -> dict:
        return dict(self._stats)

    def _is_duplicate(self, norm: str) -> bool:
        words = norm.split()
        n_words = len(words)
        for existing in self._window:
            if norm == existing:
                return True
            existing_words = existing.split()
            if n_words < self._min_words or len(existing_words) < self._min_words:
                continue
            sim = _word_jaccard(norm, existing)
            if sim >= self._threshold:
                return True
            if n_words >= 3 and len(existing_words) >= 3:
                new_bigrams = set(words[i] + " " + words[i + 1] for i in range(n_words - 1))
                ex_bigrams = set(existing_words[i] + " " + existing_words[i + 1] for i in range(len(existing_words) - 1))
                if new_bigrams and ex_bigrams:
                    containment = len(new_bigrams & ex_bigrams) / len(new_bigrams)
                    if containment >= 0.80:
                        return True
        return False


# ═══════════════════════════════════════════════════════════════════════════
# WHISPERX SUBPROCESS BRIDGE
# ═══════════════════════════════════════════════════════════════════════════

class WhisperXBridge:
    """
    Manages a subprocess running whisperx_worker.py under a Python 3.13 venv.
    Sends audio chunks as base64 JSON, receives transcriptions.
    """

    def __init__(self):
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._ready = False

    @property
    def is_ready(self) -> bool:
        return self._ready and self._proc is not None and self._proc.poll() is None

    def start(self) -> bool:
        """Spawn the worker subprocess."""
        if self.is_ready:
            return True

        try:
            env = os.environ.copy()
            runtime_cache_dir = Path(env.get("LECTURE_LYFT_CACHE_DIR", str(DEFAULT_RUNTIME_CACHE_DIR))).expanduser()
            huggingface_cache_dir = runtime_cache_dir / "huggingface"
            xdg_cache_dir = runtime_cache_dir / "xdg"
            torch_cache_dir = runtime_cache_dir / "torch"
            matplotlib_cache_dir = DEFAULT_RUNTIME_TEMP_DIR / "matplotlib"
            for cache_dir in (
                runtime_cache_dir,
                huggingface_cache_dir,
                xdg_cache_dir,
                torch_cache_dir,
                matplotlib_cache_dir,
            ):
                cache_dir.mkdir(parents=True, exist_ok=True)

            env["LECTURE_LYFT_CACHE_DIR"] = str(runtime_cache_dir)
            env["WHISPERX_DEVICE"] = os.getenv("WHISPERX_DEVICE", "cpu")
            env["WHISPERX_MODEL"] = os.getenv("WHISPERX_MODEL", "large-v3")
            env["WHISPERX_TASK"] = os.getenv("WHISPERX_TASK", "translate")
            env["WHISPERX_COMPUTE"] = os.getenv(
                "WHISPERX_COMPUTE",
                "float16" if env["WHISPERX_DEVICE"] == "cuda" else "int8",
            )
            env["WHISPERX_BATCH_SIZE"] = os.getenv(
                "WHISPERX_BATCH_SIZE",
                "8" if env["WHISPERX_DEVICE"] != "cuda" and env["WHISPERX_MODEL"].startswith("large") else "16",
            )
            env["WHISPERX_LANGUAGE"] = os.getenv("WHISPERX_LANGUAGE", "")
            env["WHISPERX_BEAM_SIZE"] = os.getenv("WHISPERX_BEAM_SIZE", "8")
            env["WHISPERX_BEST_OF"] = os.getenv("WHISPERX_BEST_OF", "8")
            env["WHISPERX_PATIENCE"] = os.getenv("WHISPERX_PATIENCE", "1.5")
            env["WHISPERX_REPETITION_PENALTY"] = os.getenv("WHISPERX_REPETITION_PENALTY", "1.08")
            env["WHISPERX_NO_REPEAT_NGRAM_SIZE"] = os.getenv("WHISPERX_NO_REPEAT_NGRAM_SIZE", "3")
            env["WHISPERX_COMPRESSION_RATIO_THRESHOLD"] = os.getenv("WHISPERX_COMPRESSION_RATIO_THRESHOLD", "1.8")
            env["WHISPERX_LOG_PROB_THRESHOLD"] = os.getenv("WHISPERX_LOG_PROB_THRESHOLD", "-0.6")
            env["WHISPERX_NO_SPEECH_THRESHOLD"] = os.getenv("WHISPERX_NO_SPEECH_THRESHOLD", "0.72")
            env["WHISPERX_HALLUCINATION_SILENCE_THRESHOLD"] = os.getenv(
                "WHISPERX_HALLUCINATION_SILENCE_THRESHOLD",
                "0.8",
            )
            env["WHISPERX_MIN_SEGMENT_AVG_LOGPROB"] = os.getenv("WHISPERX_MIN_SEGMENT_AVG_LOGPROB", "-0.65")
            env["WHISPERX_VAD_ONSET"] = os.getenv("WHISPERX_VAD_ONSET", "0.62")
            env["WHISPERX_VAD_OFFSET"] = os.getenv("WHISPERX_VAD_OFFSET", "0.45")
            env["WHISPERX_VAD_CHUNK_SIZE"] = os.getenv("WHISPERX_VAD_CHUNK_SIZE", "20")
            env["HF_HOME"] = env.get("HF_HOME", str(huggingface_cache_dir))
            env["HF_HUB_CACHE"] = env.get("HF_HUB_CACHE", str(huggingface_cache_dir / "hub"))
            env["WHISPERX_DOWNLOAD_ROOT"] = env.get("WHISPERX_DOWNLOAD_ROOT", env["HF_HUB_CACHE"])
            env["XDG_CACHE_HOME"] = env.get("XDG_CACHE_HOME", str(xdg_cache_dir))
            env["TORCH_HOME"] = env.get("TORCH_HOME", str(torch_cache_dir))
            env["MPLCONFIGDIR"] = env.get("MPLCONFIGDIR", str(matplotlib_cache_dir))

            print(
                "🚀 Starting WhisperX worker "
                f"(model={env['WHISPERX_MODEL']}, task={env['WHISPERX_TASK']}, "
                f"language={env['WHISPERX_LANGUAGE'] or 'auto'}, device={env['WHISPERX_DEVICE']}) "
                f"with interpreter {WHISPERX_PYTHON} "
                f"using cache {runtime_cache_dir}"
            )

            self._proc = subprocess.Popen(
                [str(WHISPERX_PYTHON), str(WHISPERX_WORKER)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # line-buffered
                env=env,
            )

            # Start stderr reader thread
            self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
            self._stderr_thread.start()

            # Wait for ready signal (with timeout)
            ready_line = self._proc.stdout.readline()
            if ready_line:
                resp = json.loads(ready_line.strip())
                if resp.get("ok") and resp.get("ready"):
                    self._ready = True
                    print("✅ WhisperX worker is ready")
                    return True
                worker_error = resp.get("error", "unknown startup error")
                print(f"❌ WhisperX worker failed to initialize: {worker_error}")
                return False

            print("❌ WhisperX worker did not send ready signal")
            return False

        except Exception as e:
            print(f"❌ Failed to start WhisperX worker: {e}")
            return False

    def _read_stderr(self):
        """Continuously read and print worker's stderr (log messages)."""
        try:
            while self._proc and self._proc.poll() is None:
                line = self._proc.stderr.readline()
                if line:
                    print(f"  🔊 {line.strip()}")
        except Exception:
            pass

    def transcribe(self, audio_data: np.ndarray, sr: int = 16000) -> dict:
        """Send audio to the worker and get transcription results."""
        if not self.is_ready:
            return {"ok": False, "error": "Worker not ready"}

        # Encode audio as base64
        audio_b64 = base64.b64encode(audio_data.astype(np.float32).tobytes()).decode("ascii")

        request = json.dumps({
            "cmd": "transcribe",
            "audio_b64": audio_b64,
            "sr": sr,
        })

        with self._lock:
            try:
                self._proc.stdin.write(request + "\n")
                self._proc.stdin.flush()

                response_line = self._proc.stdout.readline()
                if not response_line:
                    return {"ok": False, "error": "Worker produced no output"}

                return json.loads(response_line.strip())

            except Exception as e:
                print(f"❌ WhisperX bridge error: {e}")
                return {"ok": False, "error": str(e)}

    def shutdown(self):
        """Gracefully stop the worker."""
        if self._proc and self._proc.poll() is None:
            try:
                with self._lock:
                    self._proc.stdin.write(json.dumps({"cmd": "shutdown"}) + "\n")
                    self._proc.stdin.flush()
                self._proc.wait(timeout=10)
            except Exception:
                self._proc.kill()
            self._ready = False
            print("🛑 WhisperX worker stopped")


# ═══════════════════════════════════════════════════════════════════════════
# AUDIO TRANSCRIBER V4
# ═══════════════════════════════════════════════════════════════════════════

class AudioTranscriberV4:
    """
    Real-time audio transcription using WhisperX via subprocess bridge.
    Drop-in compatible with AudioTranscriberV2.
    """

    def __init__(self):
        self.is_recording = False
        self.callback: Optional[Callable] = None
        self.process_thread: Optional[threading.Thread] = None

        # Audio settings (same as V2)
        self.SAMPLE_RATE = 16000
        self.CHANNELS = 1
        self.CHUNK_DURATION = 6       # seconds per processing window
        self.OVERLAP_DURATION = 1.5   # seconds of inter-chunk overlap

        # Filtering thresholds (same as V2)
        self.MIN_AUDIO_ENERGY = 0.012
        self.MIN_AUDIO_LENGTH = 1.5

        # State
        self.audio_buffer: list = []
        self.overlap_buffer: Optional[np.ndarray] = None
        self.last_text = ""
        self.last_words: list = []
        self.all_transcribed_texts: deque = deque(maxlen=20)

        # Dynamic prompt & filtering
        self.topic: Optional[str] = None
        self.dynamic_leak_patterns: List[re.Pattern] = (
            build_generic_leak_patterns() if COURSE_PROMPTS_AVAILABLE else []
        )

        # Repetition detector
        self._rep_detector = RealtimeRepetitionDetector(
            window_size=60,
            similarity_threshold=0.72,
            min_sentence_words=4,
        )

        # WhisperX bridge
        self._bridge = WhisperXBridge()
        self._model_loaded = False

        if WHISPERX_AVAILABLE:
            self._start_bridge()

    def _start_bridge(self):
        """Start the WhisperX subprocess."""
        success = self._bridge.start()
        self._model_loaded = success
        if not success:
            print("❌ WhisperX bridge failed to start")

    def set_topic(self, topic: str):
        """Set the lecture topic for filtering."""
        self.topic = topic
        if topic and topic.strip() and COURSE_PROMPTS_AVAILABLE:
            print(f"📚 Setting lecture topic: '{topic}'")
            course_name, keywords = generate_keywords(topic)
            self.dynamic_leak_patterns = build_leak_patterns(course_name, keywords)
        elif topic and topic.strip():
            pass  # No course_prompts available, skip
        else:
            self.dynamic_leak_patterns = (
                build_generic_leak_patterns() if COURSE_PROMPTS_AVAILABLE else []
            )

    def start_recording(self, callback: Callable[[str], None]):
        """Start recording and transcribing."""
        if not self._model_loaded:
            print("❌ WhisperX model not loaded")
            return False

        if self.is_recording:
            self.callback = callback
            print("ℹ️ WhisperX recording already active")
            return True

        self.callback = callback
        self.is_recording = True
        self.audio_buffer = []
        self.overlap_buffer = None
        self.last_text = ""
        self.last_words = []
        self.all_transcribed_texts.clear()

        self._rep_detector.reset()
        print("🔁 RealtimeRepetitionDetector reset for new session")

        self.process_thread = threading.Thread(target=self._process_audio, daemon=True)
        self.process_thread.start()

        print("🎤 Started recording with WhisperX V4")
        return True

    def stop_recording(self):
        """Stop recording."""
        if not self.is_recording:
            return

        self.is_recording = False
        stats = self._rep_detector.get_stats()
        print(
            f"🛑 Stopped recording | RepDetector stats: "
            f"{stats['removed']} sentences removed across "
            f"{stats['chunks_modified']} chunks "
            f"(checked {stats['checked']} total)"
        )
        if self.process_thread and self.process_thread.is_alive():
            self.process_thread.join(timeout=2)
        self.process_thread = None

    def _process_audio(self):
        """Process audio in a loop — captures from mic and sends to WhisperX."""
        print("🎧 Audio processing started (V4 — WhisperX)")

        def audio_callback(indata, frames, time_info, status):
            if status:
                print(f"⚠️  Audio status: {status}")
            if self.is_recording:
                self.audio_buffer.append(indata.copy())

        try:
            with sd.InputStream(
                samplerate=self.SAMPLE_RATE,
                channels=self.CHANNELS,
                dtype='float32',
                callback=audio_callback,
                blocksize=int(self.SAMPLE_RATE * 0.5),
            ):
                last_process_time = time.time()

                while self.is_recording:
                    current_time = time.time()

                    if current_time - last_process_time >= self.CHUNK_DURATION:
                        if self.audio_buffer:
                            buffer_to_process = self.audio_buffer.copy()
                            self.audio_buffer.clear()

                            audio_data = np.concatenate(buffer_to_process)

                            # Overlap handling
                            if self.overlap_buffer is not None:
                                audio_data = np.concatenate([self.overlap_buffer, audio_data])

                            overlap_samples = int(self.SAMPLE_RATE * self.OVERLAP_DURATION)
                            if len(audio_data) > overlap_samples:
                                self.overlap_buffer = audio_data[-overlap_samples:]

                            # Normalize
                            audio_data = self._normalize_audio(audio_data)

                            # Transcribe via WhisperX
                            text = self._transcribe_chunk(audio_data)

                            if text and self.callback:
                                self.callback(text)

                            last_process_time = current_time

                    time.sleep(0.1)

        except Exception as e:
            print(f"❌ Processing error: {e}")

        print("📝 Audio processing stopped")

    @staticmethod
    def _normalize_audio(audio_data: np.ndarray) -> np.ndarray:
        max_val = np.max(np.abs(audio_data))
        if 0 < max_val < 0.5:
            audio_data = audio_data * min(0.95 / max_val, 3.0)
        return audio_data

    def _transcribe_chunk(self, audio_data: np.ndarray) -> str:
        """Transcribe audio via WhisperX bridge, then apply filtering pipeline."""
        try:
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            if len(audio_data.shape) > 1:
                audio_data = audio_data.flatten()

            # Skip if too short
            min_samples = int(self.SAMPLE_RATE * self.MIN_AUDIO_LENGTH)
            if len(audio_data) < min_samples:
                return ""

            # Skip if too quiet
            energy = calculate_audio_energy(audio_data)
            if energy < self.MIN_AUDIO_ENERGY:
                return ""

            # ── Send to WhisperX worker ──
            result = self._bridge.transcribe(audio_data, sr=self.SAMPLE_RATE)

            if not result.get("ok"):
                print(f"❌ WhisperX error: {result.get('error', 'unknown')}")
                return ""

            text = result.get("text", "").strip()
            segments = result.get("segments", [])

            if not text or len(text) < 3:
                return ""

            # Log word-level timestamps if available
            for seg in segments:
                words = seg.get("words", [])
                if words:
                    word_str = " ".join(
                        f"{w['word']}[{w.get('start', 0):.1f}-{w.get('end', 0):.1f}]"
                        for w in words[:5]
                    )
                    print(f"  📍 Word timestamps: {word_str}{'...' if len(words) > 5 else ''}")

            # ── Apply full V2 filtering pipeline ──

            # Hallucination check
            if is_hallucination(text, self.dynamic_leak_patterns):
                print(f"🚫 FILTERED hallucination: {text}")
                return ""

            # Immediate repetition detection
            text = detect_immediate_repetition(text)
            if not text or len(text.strip()) < 3:
                return ""

            # Strip repetitions
            text = strip_repetitions(text)

            # Duplicate check
            text_lower = text.lower().strip()
            if text_lower in self.all_transcribed_texts:
                return ""
            if text_lower == self.last_text.lower().strip():
                return ""
            if self.last_text and self._similarity(text_lower, self.last_text.lower()) > 0.8:
                return ""

            # Overlap removal
            text = self._remove_overlap_repetition(text)
            if not text or len(text.strip()) < 3:
                return ""

            # Cross-chunk repetition detection
            text = self._rep_detector.filter(text)
            if not text or len(text.strip()) < 3:
                return ""

            # ── Accept the text ──
            self.all_transcribed_texts.append(text_lower)
            self.last_text = text
            self.last_words = text.lower().split()

            print(f"✅ NEW (WhisperX): {text}")
            return text

        except Exception as e:
            print(f"❌ Transcription error: {e}")
            return ""

    @staticmethod
    def _similarity(a: str, b: str) -> float:
        words_a = set(a.split())
        words_b = set(b.split())
        if not words_a or not words_b:
            return 0.0
        return len(words_a & words_b) / len(words_a | words_b)

    def _remove_overlap_repetition(self, text: str) -> str:
        if not self.last_words:
            return text
        words = text.split()
        if len(words) < 3:
            return text
        words_lower = [w.lower().strip('.,!?;:-') for w in words]
        last_tail = [w.strip('.,!?;:-') for w in self.last_words[-20:]]
        best_overlap = 0
        for overlap_len in range(1, min(len(words_lower), len(last_tail)) + 1):
            if last_tail[-overlap_len:] == words_lower[:overlap_len]:
                best_overlap = overlap_len
        if best_overlap > 0:
            trimmed = ' '.join(words[best_overlap:])
            print(f"✂️  Trimmed {best_overlap} overlapping words")
            return trimmed if trimmed.strip() else ""
        return text

    def __del__(self):
        """Cleanup: shutdown the worker subprocess."""
        try:
            self._bridge.shutdown()
        except Exception:
            pass


# ═══════════════════════════════════════════════════════════════════════════
# SINGLETON FACTORY
# ═══════════════════════════════════════════════════════════════════════════

_transcriber_v4: Optional[AudioTranscriberV4] = None


def get_transcriber_v4() -> AudioTranscriberV4:
    """Get or create the V4 WhisperX transcriber (singleton)."""
    global _transcriber_v4
    if _transcriber_v4 is None:
        _transcriber_v4 = AudioTranscriberV4()
    return _transcriber_v4


def is_whisperx_available() -> bool:
    """Check if WhisperX venv and worker are available."""
    return WHISPERX_AVAILABLE


# Aliases for drop-in compatibility with main.py
def get_transcriber() -> AudioTranscriberV4:
    return get_transcriber_v4()


def is_whisper_available() -> bool:
    return is_whisperx_available()
