"""
Advanced Real-time audio transcription using Whisper Large V3 Turbo with
Samsung-style Rolling Correction.

What's new in V3 vs V2:
    - RollingCorrector: every spoken chunk is transcribed TWICE.
      * DRAFT  – emitted instantly (fast pass, like V2)
      * CORRECTION – re-transcribed 2 s later with leading audio from
        the next chunk appended as right-context so Whisper's language
        model can disambiguate ("eye scream" → "I scream for ice cream").
    - Dual-callback API: on_draft / on_correction (backwards-compatible
      with V2 when you only supply a single callback).
    - compute_word_diff() helper for animated word-level corrections in the UI.

Model Options:
    - whisper-medium (default)
    - whisper-large-v3
    - paraformer

Usage:
    Set TRANSCRIBER_MODEL env var to choose the model, then:

        transcriber = get_transcriber_v3()
        transcriber.start_recording(
            on_draft=lambda chunk_id, text: ui.show_draft(chunk_id, text),
            on_correction=lambda event: ui.replace_text(event.chunk_id, event.new_text),
        )

    Or use the legacy single-callback path (same as V2):

        transcriber.start_recording(callback=lambda text: print(text))
"""

from __future__ import annotations

import difflib
import os
import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Deque, List, Optional

import numpy as np
import sounddevice as sd
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Optional dependency imports
# ---------------------------------------------------------------------------

DEFAULT_MODEL = os.getenv("TRANSCRIBER_MODEL", "whisper-medium")

WHISPER_AVAILABLE = False
_model = None
_model_type = None

try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
    print("✅ Whisper (faster-whisper) available")
except ImportError:
    print("⚠️  Whisper (faster-whisper) not available")

try:
    import soundfile as sf  # noqa: F401 – imported for availability check
except ImportError:
    sf = None
    print("⚠️  soundfile not available")


# ===========================================================================
# HALLUCINATION FILTERING  (carried forward from V2 unchanged)
# ===========================================================================

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
            seen_phrase = False
            while i < len(words):
                if i + n <= len(words):
                    current_ngram = ' '.join(w.lower() for w in words[i:i+n])
                    if current_ngram == repeated_phrase:
                        if not seen_phrase:
                            result.extend(words[i:i+n])
                            seen_phrase = True
                        i += n
                        continue
                result.append(words[i])
                i += 1
            cleaned = ' '.join(result).strip()
            if cleaned and len(cleaned) > 3:
                return cleaned

    return text


def calculate_audio_energy(audio_data: np.ndarray) -> float:
    return float(np.sqrt(np.mean(audio_data ** 2)))


# ===========================================================================
# ROLLING CORRECTION ENGINE  (Samsung-style two-pass transcription)
# ===========================================================================

@dataclass
class TranscriptChunk:
    """One unit of transcribed audio that may still be corrected."""
    chunk_id: int
    draft_text: str
    corrected_text: Optional[str] = None
    audio_data: Optional[np.ndarray] = None
    timestamp: float = field(default_factory=time.time)
    is_final: bool = False


@dataclass
class CorrectionEvent:
    chunk_id: int
    old_text: str
    new_text: str
    similarity: float   # 0-1


DraftCallback      = Callable[[int, str], None]         # (chunk_id, text)
CorrectionCallback = Callable[[CorrectionEvent], None]


def compute_word_diff(old_text: str, new_text: str) -> list[dict]:
    """
    Return word-level diff operations for rich UI rendering.

    Each item: {"op": "equal"|"replace"|"insert"|"delete", "text": str}
    """
    old_words = old_text.split()
    new_words = new_text.split()
    matcher = difflib.SequenceMatcher(None, old_words, new_words)
    result = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            result.append({"op": "equal",  "text": " ".join(old_words[i1:i2])})
        elif tag == "replace":
            result.append({"op": "delete", "text": " ".join(old_words[i1:i2])})
            result.append({"op": "insert", "text": " ".join(new_words[j1:j2])})
        elif tag == "insert":
            result.append({"op": "insert", "text": " ".join(new_words[j1:j2])})
        elif tag == "delete":
            result.append({"op": "delete", "text": " ".join(old_words[i1:i2])})
    return result


class RollingCorrector:
    """
    Wraps any transcribe function and adds Samsung-style rolling corrections.

    Flow
    ----
    1. Chunk N  → fast pass  → DRAFT  emitted immediately
    2. Chunk N+1 arrives  → schedule re-transcribe of Chunk N after
       ``correction_delay`` seconds
    3. Re-transcription uses Chunk N audio + leading ``context_overlap_s``
       seconds of Chunk N+1 audio as right-context
    4. If result differs from draft → CORRECTION emitted

    Parameters
    ----------
    transcribe_fn:
        Callable (audio_data: np.ndarray) -> str
    on_draft:
        (chunk_id, text) called immediately after fast pass.
    on_correction:
        (CorrectionEvent) called when correction differs from draft.
    correction_delay:
        Seconds to wait before re-transcribing (default 2.0).
    context_overlap_s:
        Seconds of next chunk prepended as right-context (default 1.5).
    min_similarity_to_skip:
        Above this → no correction emitted (texts effectively identical).
    min_similarity_to_correct:
        Below this → correction discarded (too wild, likely a STT error).
    audio_retention_s:
        How long raw audio is kept for re-transcription (default 15 s).
    """

    def __init__(
        self,
        transcribe_fn: Callable[[np.ndarray], str],
        on_draft: DraftCallback,
        on_correction: CorrectionCallback,
        *,
        correction_delay: float = 2.0,
        context_overlap_s: float = 1.5,
        sample_rate: int = 16000,
        min_similarity_to_skip: float = 0.92,
        min_similarity_to_correct: float = 0.35,
        audio_retention_s: float = 15.0,
    ):
        self._transcribe         = transcribe_fn
        self._on_draft           = on_draft
        self._on_correction      = on_correction
        self.correction_delay    = correction_delay
        self.context_overlap_s   = context_overlap_s
        self.sample_rate         = sample_rate
        self.min_sim_skip        = min_similarity_to_skip
        self.min_sim_correct     = min_similarity_to_correct
        self.audio_retention_s   = audio_retention_s

        self._chunks: Deque[TranscriptChunk] = deque(maxlen=30)
        self._chunk_counter = 0
        self._lock = threading.Lock()
        self._pending_timers: list[threading.Timer] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_chunk(self, audio_data: np.ndarray) -> Optional[str]:
        """Main entry point – replaces a raw transcribe_fn call.

        Returns the draft text immediately; corrections arrive asynchronously
        via on_correction.
        """
        draft_text = self._transcribe(audio_data)

        chunk_id = self._next_id()
        chunk = TranscriptChunk(
            chunk_id=chunk_id,
            draft_text=draft_text,
            audio_data=audio_data.copy(),
        )
        with self._lock:
            self._chunks.append(chunk)

        if draft_text:
            self._on_draft(chunk_id, draft_text)

        self._schedule_correction(chunk_id)
        self._purge_old_audio()
        return draft_text

    def flush(self):
        """Cancel pending timers and mark all chunks final. Call on stop."""
        for t in self._pending_timers:
            t.cancel()
        self._pending_timers.clear()
        with self._lock:
            for c in self._chunks:
                c.is_final = True
                c.audio_data = None

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _next_id(self) -> int:
        self._chunk_counter += 1
        return self._chunk_counter

    def _schedule_correction(self, trigger_id: int):
        target_id = trigger_id - 1
        if target_id < 1:
            return
        t = threading.Timer(
            self.correction_delay,
            self._run_correction,
            args=(target_id, trigger_id),
        )
        t.daemon = True
        t.start()
        self._pending_timers.append(t)
        # Clean up dead timers
        self._pending_timers = [x for x in self._pending_timers if x.is_alive()]

    def _run_correction(self, target_id: int, context_id: int):
        with self._lock:
            target = self._find_chunk(target_id)
            ctx    = self._find_chunk(context_id)

        if target is None or target.is_final or target.audio_data is None:
            return

        # Build enriched audio: target + leading slice of context
        audio = target.audio_data
        if ctx is not None and ctx.audio_data is not None:
            overlap_samples = int(self.sample_rate * self.context_overlap_s)
            audio = np.concatenate([target.audio_data, ctx.audio_data[:overlap_samples]])

        corrected = self._transcribe(audio)
        corrected = self._trim_to_length(corrected, target.draft_text)

        sim = self._seq_similarity(target.draft_text, corrected)

        with self._lock:
            target.is_final      = True
            target.corrected_text = corrected
            target.audio_data    = None   # free memory

        if sim >= self.min_sim_skip:
            return                        # effectively identical – skip
        if corrected and sim < self.min_sim_correct:
            return                        # too wild – discard
        if not corrected and not target.draft_text:
            return

        self._on_correction(CorrectionEvent(
            chunk_id=target_id,
            old_text=target.draft_text,
            new_text=corrected,
            similarity=sim,
        ))

    def _find_chunk(self, chunk_id: int) -> Optional[TranscriptChunk]:
        for c in self._chunks:
            if c.chunk_id == chunk_id:
                return c
        return None

    def _purge_old_audio(self):
        cutoff = time.time() - self.audio_retention_s
        with self._lock:
            for c in self._chunks:
                if c.timestamp < cutoff:
                    c.audio_data = None
                    c.is_final = True

    @staticmethod
    def _seq_similarity(a: str, b: str) -> float:
        if not a and not b:
            return 1.0
        if not a or not b:
            return 0.0
        return difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()

    @staticmethod
    def _trim_to_length(corrected: str, original: str, tolerance: float = 1.5) -> str:
        """Prevent context-chunk words from bleeding into the correction."""
        if not corrected or not original:
            return corrected
        orig_words = original.split()
        corr_words = corrected.split()
        max_words  = int(len(orig_words) * tolerance) + 5
        if len(corr_words) > max_words:
            return " ".join(corr_words[:max_words])
        return corrected


# ===========================================================================
# AUDIO TRANSCRIBER V3  (V2 + RollingCorrector)
# ===========================================================================

class AudioTranscriberV3:
    """
    Real-time audio transcription with Samsung-style rolling corrections.

    Backwards-compatible with V2's single-callback API while also exposing
    the richer dual-callback (on_draft / on_correction) API.

    Parameters
    ----------
    model_name:
        Whisper model to use (default: TRANSCRIBER_MODEL env var).
    device:
        "cuda" or "cpu".
    correction_delay:
        Seconds to wait before re-transcribing a chunk (default 2.0).
    context_overlap_s:
        Seconds of next chunk used as right-context (inherits OVERLAP_DURATION).
    """

    def __init__(
        self,
        model_name: str = None,
        device: str = "cuda",
        correction_delay: float = 2.0,
    ):
        self.model_name = model_name or DEFAULT_MODEL
        self.device = device
        self.model = None
        self.is_recording = False

        # Callbacks
        self._legacy_callback: Optional[Callable[[str], None]] = None
        self._on_draft: Optional[DraftCallback] = None
        self._on_correction: Optional[CorrectionCallback] = None

        self.correction_delay = correction_delay

        # Audio settings (identical to V2)
        self.SAMPLE_RATE      = 16000
        self.CHANNELS         = 1
        self.CHUNK_DURATION   = 8      # seconds per processing window
        self.OVERLAP_DURATION = 1.5    # seconds of inter-chunk overlap

        # Filtering thresholds (identical to V2)
        self.MIN_AUDIO_ENERGY          = 0.01
        self.MIN_AUDIO_LENGTH          = 1.5
        self.NO_SPEECH_PROB_THRESHOLD  = 0.4

        # State
        self.audio_buffer   = []
        self.overlap_buffer = None
        self.last_text      = ""
        self.last_words: list[str] = []
        self.all_transcribed_texts: Deque[str] = deque(maxlen=20)
        self.language       = "en"

        self.condition_on_prev         = False
        self.consecutive_clean_chunks  = 0
        self.CLEAN_CHUNKS_TO_RESTORE   = 3
        self.chunks_since_reset        = 0
        self.total_bad_chunks          = 0
        self.MAX_BAD_CHUNKS            = 5

        # Rolling corrector – created in start_recording
        self._corrector: Optional[RollingCorrector] = None

        if WHISPER_AVAILABLE:
            self._load_model()

    # ------------------------------------------------------------------
    # Model loading (identical to V2)
    # ------------------------------------------------------------------

    def _load_model(self):
        if "whisper" in self.model_name.lower():
            self._load_whisper()
        elif "paraformer" in self.model_name.lower():
            self._load_paraformer()
        else:
            self.model_name = "whisper-medium"
            self._load_whisper()

    def _load_whisper(self):
        global _model_type
        _model_type = "whisper"
        if not WHISPER_AVAILABLE:
            print("❌ Whisper not available. Install: pip install faster-whisper")
            return
        try:
            model_map = {
                "whisper-large-v3-turbo": "large-v3-turbo",
                "whisper-large-v3":       "large-v3",
                "whisper-medium":         "medium",
                "whisper-small":          "small",
            }
            model_size = model_map.get(self.model_name, "medium")
            compute    = "float16" if self.device == "cuda" else "int8"
            print(f"🔄 Loading {model_size} on {self.device}…")
            try:
                self.model = WhisperModel(model_size, device=self.device, compute_type=compute)
                print(f"✅ Whisper {model_size} loaded on {self.device}")
            except Exception as e:
                print(f"⚠️  GPU load failed: {e}")
                if self.device == "cuda":
                    print("🔄 Falling back to CPU…")
                    self.device = "cpu"
                    self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
                    print(f"✅ Whisper {model_size} loaded on CPU")
        except Exception as e:
            print(f"❌ Failed to load Whisper: {e}")
            self.model = None

    def _load_paraformer(self):
        global _model_type
        _model_type = "paraformer"
        print("⚠️  Paraformer loading not implemented yet")
        self.model = None

    def set_topic(self, topic: str):
        """Set lecture topic (reserved for future prompt tuning)."""
        pass

    # ------------------------------------------------------------------
    # Recording lifecycle
    # ------------------------------------------------------------------

    def start_recording(
        self,
        callback: Optional[Callable[[str], None]] = None,
        on_draft: Optional[DraftCallback] = None,
        on_correction: Optional[CorrectionCallback] = None,
    ):
        """
        Start recording and transcribing.

        Modes
        -----
        Legacy (V2-compatible):
            start_recording(callback=lambda text: …)
            Drafts and corrections both arrive via ``callback``.

        V3 dual-callback:
            start_recording(
                on_draft=lambda chunk_id, text: …,
                on_correction=lambda event: …,
            )
        """
        if not self.model:
            print("❌ Model not loaded")
            return False

        self._legacy_callback = callback
        self._on_draft        = on_draft
        self._on_correction   = on_correction

        # Build the callbacks that the RollingCorrector will use
        def _draft_cb(chunk_id: int, text: str):
            if self._on_draft:
                self._on_draft(chunk_id, text)
            if self._legacy_callback:
                self._legacy_callback(text)

        def _correction_cb(event: CorrectionEvent):
            if self._on_correction:
                self._on_correction(event)
            if self._legacy_callback:
                # Legacy path: just send the corrected text again
                self._legacy_callback(f"[CORRECTION #{event.chunk_id}] {event.new_text}")

        self._corrector = RollingCorrector(
            transcribe_fn=self._transcribe_chunk,
            on_draft=_draft_cb,
            on_correction=_correction_cb,
            correction_delay=self.correction_delay,
            context_overlap_s=self.OVERLAP_DURATION,
            sample_rate=self.SAMPLE_RATE,
        )

        self.is_recording = True
        self.audio_buffer = []
        self.overlap_buffer = None
        self.last_text = ""
        self.last_words = []
        self.all_transcribed_texts.clear()
        self.condition_on_prev = False
        self.consecutive_clean_chunks = 0
        self.chunks_since_reset = 0
        self.total_bad_chunks = 0

        self.process_thread = threading.Thread(target=self._process_audio, daemon=True)
        self.process_thread.start()

        print(f"🎤 Started recording with {self.model_name} (RollingCorrector ON)")
        return True

    def stop_recording(self):
        """Stop recording and flush pending corrections."""
        self.is_recording = False
        if self._corrector:
            self._corrector.flush()
        print("🛑 Stopped recording")

    # ------------------------------------------------------------------
    # Audio capture and dispatch
    # ------------------------------------------------------------------

    def _process_audio(self):
        print("🎧 Audio processing started (V3)")

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

                            if self.overlap_buffer is not None:
                                audio_data = np.concatenate([self.overlap_buffer, audio_data])

                            overlap_samples = int(self.SAMPLE_RATE * self.OVERLAP_DURATION)
                            if len(audio_data) > overlap_samples:
                                self.overlap_buffer = audio_data[-overlap_samples:]

                            audio_data = self._normalize_audio(audio_data)

                            # Feed to the rolling corrector instead of
                            # directly to _transcribe_chunk
                            if self._corrector:
                                self._corrector.process_chunk(audio_data)

                            last_process_time = current_time

                    time.sleep(0.1)

        except Exception as e:
            print(f"❌ Processing error: {e}")

        print("📝 Audio processing stopped")

    # ------------------------------------------------------------------
    # Transcription (identical to V2 – the corrector calls this directly)
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_audio(audio_data: np.ndarray) -> np.ndarray:
        max_val = np.max(np.abs(audio_data))
        if 0 < max_val < 0.5:
            audio_data = audio_data * min(0.95 / max_val, 3.0)
        return audio_data

    def _transcribe_chunk(self, audio_data: np.ndarray) -> str:
        """Transcribe a chunk of audio.  Called by RollingCorrector (twice per chunk)."""
        try:
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            if len(audio_data.shape) > 1:
                audio_data = audio_data.flatten()

            min_samples = int(self.SAMPLE_RATE * self.MIN_AUDIO_LENGTH)
            if len(audio_data) < min_samples:
                return ""
            if calculate_audio_energy(audio_data) < self.MIN_AUDIO_ENERGY:
                return ""

            if _model_type == "whisper":
                return self._transcribe_whisper(audio_data)
            return ""

        except Exception as e:
            print(f"❌ Transcription error: {e}")
            return ""

    def _transcribe_whisper(self, audio_data: np.ndarray) -> str:
        try:
            transcribe_kwargs = dict(
                beam_size=5,
                temperature=0.0,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=1000,
                    speech_pad_ms=600,
                    threshold=0.6,
                ),
                condition_on_previous_text=self.condition_on_prev,
                no_speech_threshold=0.4,
                log_prob_threshold=-0.5,
                initial_prompt=None,
                hallucination_silence_threshold=1.0,
                language="en",
            )
            self.chunks_since_reset += 1

            segments, info = self.model.transcribe(audio_data, **transcribe_kwargs)  # noqa: F841

            valid_segments = []
            for segment in segments:
                seg_text = segment.text.strip()
                if segment.no_speech_prob > self.NO_SPEECH_PROB_THRESHOLD:
                    continue
                if is_hallucination(seg_text):
                    continue
                seg_text = strip_repetitions(seg_text)
                if seg_text and len(seg_text.strip()) > 2:
                    valid_segments.append(seg_text)

            text = " ".join(valid_segments).strip()

            if text and len(text) > 2:
                if is_hallucination(text):
                    self.condition_on_prev = False
                    self.consecutive_clean_chunks = 0
                    self.total_bad_chunks += 1
                    self.chunks_since_reset = 0
                    if self.total_bad_chunks >= self.MAX_BAD_CHUNKS:
                        print(f"⚠️  Too many bad chunks ({self.total_bad_chunks}), context permanently off")
                    return ""

                text = strip_repetitions(text)

                text_lower = text.lower().strip()
                if text_lower in self.all_transcribed_texts:
                    return ""
                if text_lower == self.last_text.lower().strip():
                    return ""
                if self.last_text and self._word_similarity(text_lower, self.last_text.lower()) > 0.85:
                    return ""

                text = self._remove_overlap_repetition(text)
                if not text or len(text.strip()) < 3:
                    return ""

                self.all_transcribed_texts.append(text_lower)
                self.last_text  = text
                self.last_words = text.lower().split()

                self.consecutive_clean_chunks += 1
                if (
                    self.consecutive_clean_chunks >= self.CLEAN_CHUNKS_TO_RESTORE
                    and len(text.split()) >= 5
                    and self.total_bad_chunks < self.MAX_BAD_CHUNKS
                ):
                    if not self.condition_on_prev:
                        print(f"✅ Context restored after {self.consecutive_clean_chunks} clean chunks")
                    self.condition_on_prev = True

                print(f"✅ NEW: {text}")
                return text

        except Exception as e:
            print(f"❌ Whisper error: {e}")

        return ""

    # ------------------------------------------------------------------
    # Text utilities (identical to V2)
    # ------------------------------------------------------------------

    @staticmethod
    def _word_similarity(a: str, b: str) -> float:
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
        last_tail   = [w.strip('.,!?;:-') for w in self.last_words[-20:]]
        best_overlap = 0
        for overlap_len in range(1, min(len(words_lower), len(last_tail)) + 1):
            if last_tail[-overlap_len:] == words_lower[:overlap_len]:
                best_overlap = overlap_len
        if best_overlap > 0:
            trimmed = ' '.join(words[best_overlap:])
            print(f"✂️  Trimmed {best_overlap} overlapping words: '{' '.join(words[:best_overlap])}'")
            return trimmed if trimmed.strip() else ""
        return text


# ===========================================================================
# Singleton factory
# ===========================================================================

_transcriber_v3: Optional[AudioTranscriberV3] = None


def get_transcriber_v3() -> AudioTranscriberV3:
    """Get or create the V3 transcriber instance (singleton)."""
    global _transcriber_v3
    if _transcriber_v3 is None:
        model  = os.getenv("TRANSCRIBER_MODEL", "whisper-medium")
        device = os.getenv("TRANSCRIBER_DEVICE", "cuda")
        _transcriber_v3 = AudioTranscriberV3(model_name=model, device=device)
    return _transcriber_v3


def is_whisper_available_v3() -> bool:
    return WHISPER_AVAILABLE


# Aliases for drop-in compatibility
def get_transcriber() -> AudioTranscriberV3:
    return get_transcriber_v3()


def is_whisper_available() -> bool:
    return WHISPER_AVAILABLE


# ===========================================================================
# patch_transcriber() – apply RollingCorrector to an existing V2 instance
# ===========================================================================

def patch_transcriber(transcriber, on_draft: DraftCallback, on_correction: CorrectionCallback):
    """
    Monkey-patch an existing AudioTranscriberV2 instance with rolling correction.

    Useful for upgrading a live V2 session without changing any surrounding code.

        from audio_transcriber_v3 import patch_transcriber

        transcriber = get_transcriber_v2()
        patch_transcriber(transcriber, on_draft=…, on_correction=…)

    After patching, start_recording() works as before; corrections arrive
    via on_correction instead of (or in addition to) the regular callback.
    """
    corrector = RollingCorrector(
        transcribe_fn=transcriber._transcribe_chunk,
        on_draft=on_draft,
        on_correction=on_correction,
        sample_rate=transcriber.SAMPLE_RATE,
        correction_delay=2.0,
        context_overlap_s=transcriber.OVERLAP_DURATION,
    )

    def patched_transcribe_chunk(audio_data: np.ndarray) -> str:
        return corrector.process_chunk(audio_data)

    transcriber._transcribe_chunk    = patched_transcribe_chunk
    transcriber._rolling_corrector   = corrector

    original_stop = transcriber.stop_recording

    def patched_stop():
        corrector.flush()
        original_stop()

    transcriber.stop_recording = patched_stop

    print("✅ RollingCorrector patched onto V2 transcriber")
    return corrector


# ===========================================================================
# Standalone demo (no microphone required)
# ===========================================================================

if __name__ == "__main__":
    print("=== Rolling Correction Demo (mock transcriber) ===\n")

    mock_pairs = [
        ("eye scream for ice cream",  "I scream for ice cream"),
        ("the whether is nice today", "the weather is nice today"),
        ("recognize speech",          "recognize speech"),           # no change
        ("wreck a nice beach",        "recognize speech"),           # classic
        ("its raining its poring",    "it's raining it's pouring"),
    ]

    call_count = [0]

    def _mock_transcribe(audio_data: np.ndarray) -> str:
        idx = call_count[0] % len(mock_pairs)
        call_count[0] += 1
        return mock_pairs[idx][0] if call_count[0] % 2 == 1 else mock_pairs[idx][1]

    results = []

    def _on_draft(chunk_id, text):
        print(f"  📝 DRAFT    #{chunk_id:02d}: {text}")
        results.append((chunk_id, "draft", text))

    def _on_correction(event):
        diff = compute_word_diff(event.old_text, event.new_text)
        diff_str = " ".join(
            f"\033[9m{d['text']}\033[0m"  if d["op"] == "delete" else
            f"\033[1m{d['text']}\033[0m"  if d["op"] == "insert" else
            d["text"]
            for d in diff
        )
        print(f"  ✨ CORRECTED #{event.chunk_id:02d}: {diff_str}  (sim={event.similarity:.2f})")
        results.append((event.chunk_id, "correction", event.new_text))

    corrector = RollingCorrector(
        transcribe_fn=_mock_transcribe,
        on_draft=_on_draft,
        on_correction=_on_correction,
        correction_delay=0.3,
        sample_rate=16000,
    )

    dummy = np.zeros(16000 * 3, dtype=np.float32)
    print("Feeding 5 chunks…\n")
    for _ in range(5):
        corrector.process_chunk(dummy)
        time.sleep(0.8)

    time.sleep(1.5)
    corrector.flush()
    print(f"\nTotal events: {len(results)}")
