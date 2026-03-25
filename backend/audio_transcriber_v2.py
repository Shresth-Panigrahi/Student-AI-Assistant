"""
audio-transcriber-v2.py
Advanced Real-time audio transcription using Whisper Large V3 Turbo and Paraformer models.
This is a newer implementation with improved hallucination filtering and model selection.

Model Options:
- large-v3-turbo: Best accuracy/speed balance, 809M params
- paraformer-tdt: Fastest (3386x RTFx), 600M params, word timestamps
- large-v3: Highest accuracy, 1550M params (slower)

Usage:
    Set TRANSCRIBER_MODEL env var to choose:
    - "large-v3-turbo" (default)
    - "large-v3"
    - "turbo"
    - "small"
    - "medium"
    - "paraformer"
"""

import os
import numpy as np
import sounddevice as sd
import queue
import threading
import re
from typing import Callable, Optional, List
import time
from dotenv import load_dotenv
from collections import deque
load_dotenv()

# Import course_prompts for dynamic topic-based prompts
try:
    from course_prompts import generate_keywords, build_initial_prompt, build_leak_patterns, build_generic_leak_patterns
    COURSE_PROMPTS_AVAILABLE = True
    print("✅ course_prompts available")
except ImportError:
    COURSE_PROMPTS_AVAILABLE = False
    print("⚠️  course_prompts not available")

# Model selection from environment
DEFAULT_MODEL = os.getenv("TRANSCRIBER_MODEL", "medium")

# Try to import STT libraries
WHISPER_AVAILABLE = False
PARAFORMER_AVAILABLE = False
_model = None
_model_type = None

try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
    print("✅ Whisper (faster-whisper) available")
except ImportError:
    print("⚠️  Whisper (faster-whisper) not available")

try:
    import soundfile as sf
except ImportError:
    sf = None
    print("⚠️  soundfile not available")

# ============================================================
# IMPROVED HALLUCINATION DETECTION
# ============================================================

# Expanded hallucination patterns - TURBO OPTIMIZED
HALLUCINATION_PATTERNS = [
    # YouTube/Social media
    r"thank you for watching",
    r"thanks for watching",
    r"please subscribe",
    r"like and subscribe",
    r"don't forget to subscribe",
    r"hit the bell",
    r"click the link",
    r"see you in the next",
    r"see you next time",
    r"bye[\s\-]*bye",
    r"goodbye",
    r"smash the like button",
    r"leave a comment",
    # Music/Symbols
    r"♪",
    r"🎵",
    r"\[music\]",
    r"\[applause\]",
    r"\[laughter\]",
    r"\[silence\]",
    r"\[inaudible\]",
    r"\[background music\]",
    r"\[coughing\]",
    r"\[cough\]",
    # Foreign language hallucinations
    r"字幕",
    r"ご視聴",
    r"視聴",
    r"الحمد",
    r"بسم الله",
    r"이 비디오",
    r"구독",
    # Repetition patterns
    r"^(.{2,30})\s+\1{2,}$",
    # Generic filler - EXTENDED for Turbo
    r"^(um+|uh+|ah+|oh+|hmm+|er+|ahem+)[\s\.]*$",
    r"^\.+$",
    r"^\s*$",
    # Nonsense - EXTENDED
    r"^you$",
    r"^\.{2,}$",
    r"^I'm going to",
    r"^So,?\s*$",
    r"^And,?\s*$",
    r"^The\s*$",
    r"^It's\s*$",
    r"^Okay,?\s*$",
    r"^Right,?\s*$",
    r"^Yes,?\s*$",
    r"^No,?\s*$",
    r"^Well,?\s*$",
    r"^Now,?\s*$",
    # Common Turbo hallucinations
    r"^alright[\s,.]*$",
    r"^moving on[\s,.]*$",
    r"^next slide[\s,.]*$",
    r"^as you can see[\s,.]*$",
    r"^let's look at[\s,.]*$",
    r"^if we look[\s,.]*$",
    r"^here we have[\s,.]*$",
    r"^this is called[\s,.]*$",
    r"^in this case[\s,.]*$",
    r"^essentially[\s,.]*$",
    r"^basically[\s,.]*$",
    r"\b([a-zA-Z])(?:[-\s]?\1){3,}\b",   # B-b-b-b stutter
    r"\b(\w+)(?:\s+\1){3,}\b",           # repeated word
    # Prompt leak patterns
    r"technical terms include",
    r"the professor may reference",
    r"this is a lecture",
    r"lecture transcription",
    r"academic lecture",
    r"this is an academic",
]

COMPILED_HALLUCINATION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE) for pattern in HALLUCINATION_PATTERNS
]


def is_hallucination(text: str, extra_patterns: Optional[List["re.Pattern"]] = None) -> bool:
    """Check if text is hallucinated."""
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

    # Excessive repetition check
    words = text_stripped.lower().split()
    if len(words) >= 4:
        word_counts = {}
        for word in words:
            word_counts[word] = word_counts.get(word, 0) + 1
        if max(word_counts.values()) / len(words) > 0.7:
            return True

    return False


def strip_repetitions(text: str) -> str:
    """Remove repeated phrases while keeping valid content."""
    text = text.strip()

    # Handle underscores/dashes
    if re.search(r'_{3,}', text):
        cleaned = re.sub(r'\s*_{3,}\s*', ' ', text).strip()
        if cleaned and len(cleaned) > 5:
            text = cleaned
        else:
            return ""

    if re.search(r'-{5,}', text):
        cleaned = re.sub(r'\s*-{5,}\s*', ' ', text).strip()
        if cleaned and len(cleaned) > 5:
            text = cleaned
        else:
            return ""

    words = text.split()
    if len(words) < 6:
        return text

    # Remove repeated n-grams
    for n in [3, 2]:
        if len(words) < n * 2:
            continue

        ngrams = [' '.join(words[i:i+n]) for i in range(len(words) - n + 1)]
        ngram_counts = {}
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


# ============================================================
# IMMEDIATE REPETITION DETECTOR (Layer 1)
# ============================================================

def detect_immediate_repetition(text: str) -> str:
    """
    Detect and remove immediate repetitions in a single chunk BEFORE they accumulate.
    This catches patterns like "weekend. weekend. weekend. weekend." early.

    Returns cleaned text or empty string if the entire chunk is garbage repetition.
    """
    if not text or not text.strip():
        return text

    text = text.strip()
    words = text.split()

    # Need at least some words to check
    if len(words) < 4:
        return text

    # Check 1: Single word repeated (e.g., "weekend. weekend. weekend.")
    word_counts = {}
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
                print(f"🛑 REJECTED: Single word repetition '{repeated_word}' ({max_count}x)")
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
                        print(f"✂️  Removed repeated word '{repeated_word}', kept: {result[:50]}...")
                        return result

    # Check 2: Short phrase repeated (2-3 words repeated 3+ times)
    for phrase_len in [3, 2]:
        if len(words) < phrase_len * 2:
            continue

        phrases = [' '.join(words[i:i+phrase_len]).lower() for i in range(len(words) - phrase_len + 1)]
        phrase_counts = {}
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
                    print(f"🛑 REJECTED: Phrase repetition '{repeated_phrase}' ({max_phrase_count}x)")
                    return ""

    # Check 3: Alternating pattern detection
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
                print(f"🛑 REJECTED: Alternating pattern detected")
                return ""

    return text


# ============================================================
# REAL-TIME REPETITION DETECTOR
# ============================================================

def _normalize_for_comparison(text: str) -> str:
    """Normalize text for duplicate comparison: lowercase, strip punctuation, collapse whitespace."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _split_into_sentences(text: str) -> List[str]:
    """Split text into sentence-like units on . ! ? and semicolons."""
    parts = re.split(r"(?<=[.!?;])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _word_jaccard(a: str, b: str) -> float:
    """Word-level Jaccard similarity between two normalized strings."""
    sa = set(a.split())
    sb = set(b.split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


class RealtimeRepetitionDetector:
    """
    Sliding-window, sentence-level repetition detector that runs *before*
    transcribed text is queued.

    Design goals
    ------------
    1. **Sentence fingerprinting** — each incoming chunk is split into
       sentences; every sentence is checked against a rolling window of
       recently emitted sentences (normalised).
    2. **Partial-match removal** — duplicate sentences are stripped out
       rather than the whole chunk being discarded, preserving genuinely
       new content that arrived in the same chunk.
    3. **Fuzzy matching** — Jaccard similarity (configurable threshold)
       catches near-duplicates produced by the 1.5 s audio overlap even
       when Whisper adds/drops a word or two.
    4. **Phrase-level n-gram check** — for sentences short enough that
       Jaccard is unreliable, a bigram/trigram overlap check is used.
    5. **Zero external deps** — pure Python / stdlib only.

    Parameters
    ----------
    window_size : int
        Number of recent sentences kept in memory (default 60 ≈ ~3 min
        of typical lecture speech at ~1 sentence per 3 s).
    similarity_threshold : float
        Jaccard similarity above which a sentence is considered a duplicate
        (default 0.72).
    min_sentence_words : int
        Sentences shorter than this are compared with exact-match only
        (default 4 words).
    """

    def __init__(
        self,
        window_size: int = 60,
        similarity_threshold: float = 0.72,
        min_sentence_words: int = 4,
    ):
        self._window: deque = deque(maxlen=window_size)
        self._threshold = similarity_threshold
        self._min_words = min_sentence_words
        self._stats = {"checked": 0, "removed": 0, "chunks_modified": 0}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def filter(self, text: str) -> str:
        """
        Remove sentences from *text* that are already present in the
        recent window.  New (non-duplicate) sentences are added to the
        window and the cleaned text is returned.

        Returns an empty string if every sentence was a duplicate.
        """
        if not text or not text.strip():
            return text

        sentences = _split_into_sentences(text)
        kept = []
        any_removed = False

        for sentence in sentences:
            norm = _normalize_for_comparison(sentence)
            self._stats["checked"] += 1

            if self._is_duplicate(norm):
                print(f"🔁 RepDetector dropped duplicate: '{sentence[:60]}'")
                self._stats["removed"] += 1
                any_removed = True
            else:
                kept.append(sentence)
                self._window.append(norm)

        if any_removed:
            self._stats["chunks_modified"] += 1

        if not kept:
            return ""

        result = " ".join(kept)
        return result

    def reset(self):
        """Clear the window (call at start of each new recording session)."""
        self._window.clear()
        self._stats = {"checked": 0, "removed": 0, "chunks_modified": 0}

    def get_stats(self) -> dict:
        """Return a copy of internal statistics for logging/debugging."""
        return dict(self._stats)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _is_duplicate(self, norm: str) -> bool:
        """Check whether *norm* (already normalised) is a duplicate of
        anything in the current window."""
        words = norm.split()
        n_words = len(words)

        for existing in self._window:
            if norm == existing:
                return True

            existing_words = existing.split()

            if n_words < self._min_words or len(existing_words) < self._min_words:
                continue

            # Jaccard similarity
            sim = _word_jaccard(norm, existing)
            if sim >= self._threshold:
                return True

            # n-gram containment
            if n_words >= 3 and len(existing_words) >= 3:
                new_bigrams = set(
                    words[i] + " " + words[i + 1]
                    for i in range(n_words - 1)
                )
                ex_bigrams = set(
                    existing_words[i] + " " + existing_words[i + 1]
                    for i in range(len(existing_words) - 1)
                )
                if new_bigrams and ex_bigrams:
                    containment = len(new_bigrams & ex_bigrams) / len(new_bigrams)
                    if containment >= 0.80:
                        return True

        return False


def calculate_audio_energy(audio_data: np.ndarray) -> float:
    """Calculate RMS energy of audio."""
    return float(np.sqrt(np.mean(audio_data ** 2)))


# ============================================================
# AUDIO TRANSCRIBER V2
# ============================================================

class AudioTranscriberV2:
    """Advanced real-time audio transcription with model selection."""

    def __init__(self, model_name: str = None, device: str = "cuda"):
        self.model_name = model_name or DEFAULT_MODEL
        self.device = device
        self.model = None
        self.is_recording = False
        self.callback: Optional[Callable] = None

        # Audio settings - OPTIMIZED
        self.SAMPLE_RATE = 16000
        self.CHANNELS = 1
        self.CHUNK_DURATION = 8
        self.OVERLAP_DURATION = 1.5

        # IMPROVED thresholds for better filtering - REDUCED HALLUCINATIONS
        self.MIN_AUDIO_ENERGY = 0.01  # Much higher - only real speech
        self.MIN_AUDIO_LENGTH = 1.5  # Longer - need substantial audio
        self.NO_SPEECH_PROB_THRESHOLD = 0.4  # Lower - skip uncertain

        # Buffers
        self.audio_buffer = []
        self.overlap_buffer = None
        self.last_text = ""
        self.last_words = []
        self.all_transcribed_texts = deque(maxlen=20)
        self.language = "en"

        self.condition_on_prev = False
        self.consecutive_clean_chunks = 0
        self.CLEAN_CHUNKS_TO_RESTORE = 3
        self.chunks_since_reset = 0
        self.total_bad_chunks = 0
        self.MAX_BAD_CHUNKS = 5

        # Dynamic prompt & hallucination settings (set via set_topic())
        self.topic = None
        self.initial_prompt = "This is a lecture transcription. The speaker is discussing academic topics."
        self.dynamic_leak_patterns: List["re.Pattern"] = build_generic_leak_patterns() if COURSE_PROMPTS_AVAILABLE else []

        # Real-time repetition detector
        self._rep_detector = RealtimeRepetitionDetector(
            window_size=60,
            similarity_threshold=0.72,
            min_sentence_words=4,
        )

        # Load model
        if WHISPER_AVAILABLE or PARAFORMER_AVAILABLE:
            self._load_model()

    def set_topic(self, topic: str):
        """Set the lecture topic — generates keywords via Gemini AI,
        builds a domain-specific initial prompt, and creates
        hallucination leak patterns dynamically."""
        self.topic = topic
        if topic and topic.strip() and COURSE_PROMPTS_AVAILABLE:
            print(f"📚 Setting lecture topic: '{topic}'")
            course_name, keywords = generate_keywords(topic)
            self.initial_prompt = build_initial_prompt(course_name, keywords)
            self.dynamic_leak_patterns = build_leak_patterns(course_name, keywords)
            print(f"📝 Initial prompt: {self.initial_prompt[:100]}...")
        elif topic and topic.strip():
            self.initial_prompt = f"This is a lecture about {topic}. The speaker is discussing academic topics related to {topic}."
        else:
            # Reset to default
            self.initial_prompt = "This is a lecture transcription. The speaker is discussing academic topics."
            self.dynamic_leak_patterns = build_generic_leak_patterns() if COURSE_PROMPTS_AVAILABLE else []
            print("ℹ️  No topic set — using generic initial prompt")

    def _load_model(self):
        """Load the selected model."""
        global _model_type

        if "whisper" in self.model_name.lower():
            self._load_whisper()
        elif "paraformer" in self.model_name.lower():
            self._load_paraformer()
        else:
            # Default to medium
            self.model_name = "medium"
            self._load_whisper()

    def _load_whisper(self):
        """Load Whisper model."""
        global _model_type
        _model_type = "whisper"

        if not WHISPER_AVAILABLE:
            print("❌ Whisper not available. Install: pip install faster-whisper")
            return

        try:
            # Model size mapping
            model_map = {
                "whisper-medium": "medium",
                "whisper-large-v3": "large-v3",
                "whisper-medium": "medium",
                "whisper-small": "small",
            }

            model_size = model_map.get(self.model_name, "medium")
            compute = "float16" if self.device == "cuda" else "int8"

            print(f"🔄 Loading {model_size} on {self.device}...")

            # Try GPU first
            try:
                self.model = WhisperModel(model_size, device=self.device, compute_type=compute)
                print(f"✅ Whisper {model_size} loaded on {self.device}")
            except Exception as e:
                print(f"⚠️  GPU load failed: {e}")
                if self.device == "cuda":
                    print("🔄 Falling back to CPU...")
                    self.device = "cpu"
                    self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
                    print(f"✅ Whisper {model_size} loaded on CPU")

        except Exception as e:
            print(f"❌ Failed to load Whisper: {e}")
            self.model = None

    def _load_paraformer(self):
        """Load Paraformer model (placeholder - requires paraformer-es package)."""
        global _model_type
        _model_type = "paraformer"

        print("⚠️  Paraformer loading not implemented yet")
        print("   Install: pip install paraformer-es")
        self.model = None

    def start_recording(self, callback: Callable[[str], None]):
        """Start recording and transcribing."""
        if not self.model:
            print("❌ Model not loaded")
            return False

        self.callback = callback
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

        # Reset the repetition detector for a clean session
        self._rep_detector.reset()
        print("🔁 RealtimeRepetitionDetector reset for new session")

        self.process_thread = threading.Thread(target=self._process_audio, daemon=True)
        self.process_thread.start()

        print(f"🎤 Started recording with {self.model_name}")
        return True

    def stop_recording(self):
        """Stop recording."""
        self.is_recording = False
        stats = self._rep_detector.get_stats()
        print(
            f"🛑 Stopped recording | RepDetector stats: "
            f"{stats['removed']} sentences removed across "
            f"{stats['chunks_modified']} chunks "
            f"(checked {stats['checked']} total)"
        )

    def _process_audio(self):
        """Process audio in a loop."""
        print("🎧 Audio processing started")

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
                blocksize=int(self.SAMPLE_RATE * 0.5)
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

                            # Transcribe
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
        """Normalize audio volume."""
        max_val = np.max(np.abs(audio_data))
        if max_val > 0 and max_val < 0.5:
            audio_data = audio_data * min(0.95 / max_val, 3.0)
        return audio_data

    def _transcribe_chunk(self, audio_data: np.ndarray) -> str:
        """Transcribe audio chunk with improved filtering."""
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

            # Transcribe based on model type
            if _model_type == "whisper":
                text = self._transcribe_whisper(audio_data)
            else:
                text = ""

            return text

        except Exception as e:
            print(f"❌ Transcription error: {e}")
            return ""

    def _transcribe_whisper(self, audio_data: np.ndarray) -> str:
        """Transcribe with Whisper - IMPROVED settings with full filtering pipeline."""
        try:
            # OPTIMIZED transcription settings - REDUCED HALLUCINATIONS
            transcribe_kwargs = dict(
                beam_size=5,
                temperature=0.0,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=1000,  # Increased - skip more silence
                    speech_pad_ms=600,  # Increased - cleaner boundaries
                    threshold=0.6,  # Higher - only clear speech
                ),
                condition_on_previous_text=self.condition_on_prev,
                no_speech_threshold=0.4,  # Lower - skip uncertain segments
                log_prob_threshold=-0.5,  # Higher - require confident predictions
                initial_prompt=self.initial_prompt if self.chunks_since_reset == 0 else None,
                hallucination_silence_threshold=1.0,  # Lower - skip silent hallucination
                language="en",
            )
            self.chunks_since_reset += 1

            segments, info = self.model.transcribe(audio_data, **transcribe_kwargs)

            # Extract valid segments
            valid_segments = []
            for segment in segments:
                seg_text = segment.text.strip()

                # Skip low speech probability
                if segment.no_speech_prob > self.NO_SPEECH_PROB_THRESHOLD:
                    print(f"🔇 SKIPPED low-speech segment (prob={segment.no_speech_prob:.2f}): {seg_text}")
                    continue

                # Skip hallucinations (using dynamic leak patterns)
                if is_hallucination(seg_text, self.dynamic_leak_patterns):
                    print(f"🚫 FILTERED hallucination: {seg_text}")
                    continue

                # Strip repetitions
                seg_text = strip_repetitions(seg_text)
                if seg_text and len(seg_text.strip()) > 2:
                    valid_segments.append(seg_text)

            text = " ".join(valid_segments).strip()

            if text and len(text) > 2:
                # Final hallucination check on combined text (with dynamic patterns)
                if is_hallucination(text, self.dynamic_leak_patterns):
                    print(f"🚫 FILTERED combined hallucination: {text}")
                    self.condition_on_prev = False
                    self.consecutive_clean_chunks = 0
                    self.total_bad_chunks += 1
                    self.chunks_since_reset = 0
                    if self.total_bad_chunks >= self.MAX_BAD_CHUNKS:
                        print(f"⚠️  Too many bad chunks ({self.total_bad_chunks}), context permanently off")
                    return ""

                # ── Immediate repetition detection ──
                text = detect_immediate_repetition(text)
                if not text or len(text.strip()) < 3:
                    print(f"🛑 SKIPPED — immediate repetition detected")
                    return ""

                # Strip remaining repetitions as backup
                text = strip_repetitions(text)

                # Check if we've already sent this exact text
                text_lower = text.lower().strip()

                if text_lower in self.all_transcribed_texts:
                    print(f"🔄 SKIPPED duplicate: {text[:40]}...")
                    return ""

                # Check if it's the same as last text
                if text_lower == self.last_text.lower().strip():
                    print(f"🔄 SKIPPED same as last: {text[:40]}...")
                    return ""

                # Check for high similarity with last text (fuzzy duplicate)
                if self.last_text and self._similarity(text_lower, self.last_text.lower()) > 0.8:
                    print(f"🔄 SKIPPED similar to last: {text[:40]}...")
                    return ""

                # Remove repeated words from overlap region
                text = self._remove_overlap_repetition(text)
                if not text or len(text.strip()) < 3:
                    return ""

                # ── Real-time repetition detection (sentence-level, cross-chunk) ──
                text = self._rep_detector.filter(text)
                if not text or len(text.strip()) < 3:
                    print(f"🔁 SKIPPED — all sentences already seen (RepDetector)")
                    return ""

                # NEW TEXT - send it
                self.all_transcribed_texts.append(text_lower)
                self.last_text = text
                self.last_words = text.lower().split()

                # Update context state — clean chunk
                self.consecutive_clean_chunks += 1
                if (self.consecutive_clean_chunks >= self.CLEAN_CHUNKS_TO_RESTORE
                        and len(text.split()) >= 5
                        and self.total_bad_chunks < self.MAX_BAD_CHUNKS):
                    if not self.condition_on_prev:
                        print(f"✅ Context restored after {self.consecutive_clean_chunks} clean chunks")
                    self.condition_on_prev = True

                print(f"✅ NEW: {text}")
                return text

        except Exception as e:
            print(f"❌ Whisper error: {e}")

        return ""

    @staticmethod
    def _similarity(a: str, b: str) -> float:
        """Calculate word-based similarity."""
        words_a = set(a.split())
        words_b = set(b.split())
        if not words_a or not words_b:
            return 0.0
        intersection = words_a & words_b
        union = words_a | words_b
        return len(intersection) / len(union)

    def _remove_overlap_repetition(self, text: str) -> str:
        """Remove words at the start that were already in the previous chunk's tail.
        This happens because of the 1.5s audio overlap between chunks."""
        if not self.last_words:
            return text

        words = text.split()
        if len(words) < 3:
            return text

        # Strip punctuation for comparison only
        words_lower = [w.lower().strip('.,!?;:-') for w in words]
        last_tail = [w.strip('.,!?;:-') for w in self.last_words[-20:]]  # was -8

        best_overlap = 0
        for overlap_len in range(1, min(len(words_lower), len(last_tail)) + 1):
            if last_tail[-overlap_len:] == words_lower[:overlap_len]:
                best_overlap = overlap_len

        if best_overlap > 0:
            trimmed = ' '.join(words[best_overlap:])
            print(f"✂️  Trimmed {best_overlap} overlapping words: '{' '.join(words[:best_overlap])}'")
            return trimmed if trimmed.strip() else ""

        return text

# Global instance
_transcriber_v2: Optional[AudioTranscriberV2] = None


def get_transcriber_v2() -> AudioTranscriberV2:
    """Get or create V2 transcriber instance."""
    global _transcriber_v2
    if _transcriber_v2 is None:
        model = os.getenv("TRANSCRIBER_MODEL", "medium")
        device = os.getenv("TRANSCRIBER_DEVICE", "cuda")
        _transcriber_v2 = AudioTranscriberV2(model_name=model, device=device)
    return _transcriber_v2


def is_whisper_available_v2() -> bool:
    """Check if V2 transcriber is available."""
    return WHISPER_AVAILABLE


# Alias for compatibility
def get_transcriber():
    """Get default transcriber (points to V2 if available)."""
    return get_transcriber_v2()


def is_whisper_available():
    """Check if transcriber is available."""
    return is_whisper_available_v2()


def transcribe_file(file_path: str, model_name: str = None) -> dict:
    """
    Transcribe an entire audio file (batch transcription).
    Returns dict with 'transcript', 'duration', 'language', 'error'.
    """
    if not WHISPER_AVAILABLE:
        return {"error": "Whisper not available", "transcript": "", "duration": 0}

    try:
        import faster_whisper

        # Use default model if not specified
        if model_name is None:
            model_name = os.getenv("TRANSCRIBER_MODEL", "medium")

        print(f"🔄 Loading Whisper model: {model_name}...")
        model = faster_whisper.WhisperModel(
            model_name,
            device=os.getenv("TRANSCRIBER_DEVICE", "auto"),
            compute_type="float16"
        )

        print(f"📝 Transcribing file: {file_path}")
        segments, info = model.transcribe(
            file_path,
            beam_size=5,
            temperature=0.0,
            language="en",
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=1000,
                speech_pad_ms=600,
                threshold=0.5,
            ),
        )

        # Collect all transcribed text
        transcript_parts = []
        for segment in segments:
            text = segment.text.strip()
            if text:
                # Apply filtering to each segment
                if not is_hallucination(text):
                    text = strip_repetitions(text)
                    if text and len(text) > 2:
                        transcript_parts.append(text)

        full_transcript = " ".join(transcript_parts).strip()

        print(f"✅ Transcription complete: {len(full_transcript)} chars, {info.duration:.2f}s")

        return {
            "transcript": full_transcript,
            "duration": info.duration,
            "language": info.language,
            "error": None
        }

    except Exception as e:
        print(f"❌ Batch transcription error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e), "transcript": "", "duration": 0}


