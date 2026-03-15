"""
Advanced Real-time audio transcription using Whisper Large V3 Turbo and Paraformer models.
This is a newer implementation with improved hallucination filtering and model selection.

Model Options:
- whisper-large-v3-turbo: Best accuracy/speed balance, 809M params
- paraformer-tdt: Fastest (3386x RTFx), 600M params, word timestamps
- whisper-large-v3: Highest accuracy, 1550M params (slower)

Usage:
    Set TRANSCRIBER_MODEL env var to choose:
    - "whisper-large-v3-turbo" (default)
    - "whisper-large-v3"
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

load_dotenv()

# Model selection from environment
DEFAULT_MODEL = os.getenv("TRANSCRIBER_MODEL", "whisper-large-v3-turbo")

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
        self.CHUNK_DURATION = 6  # Reduced from 8 for faster processing
        self.OVERLAP_DURATION = 1.0  # Reduced overlap

        # IMPROVED thresholds for better filtering - REDUCED HALLUCINATIONS
        self.MIN_AUDIO_ENERGY = 0.01  # Much higher - only real speech
        self.MIN_AUDIO_LENGTH = 1.5  # Longer - need substantial audio
        self.NO_SPEECH_PROB_THRESHOLD = 0.4  # Lower - skip uncertain

        # Buffers
        self.audio_buffer = []
        self.overlap_buffer = None
        self.last_text = ""
        self.last_words = []
        self.all_transcribed_texts = set()
        self.language = "en"

        # Load model
        if WHISPER_AVAILABLE or PARAFORMER_AVAILABLE:
            self._load_model()

    def _load_model(self):
        """Load the selected model."""
        global _model_type

        if "whisper" in self.model_name.lower():
            self._load_whisper()
        elif "paraformer" in self.model_name.lower():
            self._load_paraformer()
        else:
            # Default to whisper-large-v3-turbo
            self.model_name = "whisper-large-v3-turbo"
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
                "whisper-large-v3-turbo": "large-v3-turbo",
                "whisper-large-v3": "large-v3",
                "whisper-medium": "medium",
                "whisper-small": "small",
            }

            model_size = model_map.get(self.model_name, "large-v3-turbo")
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

    def set_topic(self, topic: str):
        """Set lecture topic (for future enhancement with topic-specific prompts)."""
        pass  # Could add dynamic prompt building here

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

        self.process_thread = threading.Thread(target=self._process_audio, daemon=True)
        self.process_thread.start()

        print(f"🎤 Started recording with {self.model_name}")
        return True

    def stop_recording(self):
        """Stop recording."""
        self.is_recording = False
        print("🛑 Stopped recording")

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
        """Transcribe with Whisper - IMPROVED settings."""
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
                condition_on_previous_text=False,  # Disable to prevent repetition
                no_speech_threshold=0.4,  # Lower - skip uncertain segments
                log_prob_threshold=-0.5,  # Higher - require confident predictions
                initial_prompt=None,  # Disable to prevent prompt leakage
                hallucination_silence_threshold=1.0,  # Lower - skip silent hallucination
                language="en",
            )

            segments, info = self.model.transcribe(audio_data, **transcribe_kwargs)

            # Extract valid segments
            valid_segments = []
            for segment in segments:
                seg_text = segment.text.strip()

                # Skip low speech probability
                if segment.no_speech_prob > self.NO_SPEECH_PROB_THRESHOLD:
                    continue

                # Skip hallucinations
                if is_hallucination(seg_text):
                    continue

                # Strip repetitions
                seg_text = strip_repetitions(seg_text)
                if seg_text and len(seg_text.strip()) > 2:
                    valid_segments.append(seg_text)

            text = " ".join(valid_segments).strip()

            if text and len(text) > 2:
                # Final checks
                if is_hallucination(text):
                    return ""

                text = strip_repetitions(text)

                # Check duplicates
                text_lower = text.lower().strip()
                if text_lower in self.all_transcribed_texts:
                    return ""

                if text_lower == self.last_text.lower().strip():
                    return ""

                # Fuzzy duplicate check
                if self.last_text and self._similarity(text_lower, self.last_text.lower()) > 0.85:
                    return ""

                # Remove overlap repetition
                text = self._remove_overlap_repetition(text)
                if not text or len(text.strip()) < 3:
                    return ""

                # Send new text
                self.all_transcribed_texts.add(text_lower)
                self.last_text = text
                self.last_words = text.lower().split()
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
        """Remove overlapping words from previous chunk."""
        if not self.last_words:
            return text

        words = text.split()
        if len(words) < 3:
            return text

        last_tail = self.last_words[-6:]

        best_overlap = 0
        for overlap_len in range(1, min(len(words), len(last_tail)) + 1):
            if last_tail[-overlap_len:] == [w.lower() for w in words[:overlap_len]]:
                best_overlap = overlap_len

        if best_overlap > 0:
            trimmed = ' '.join(words[best_overlap:])
            return trimmed

        return text


# Global instance
_transcriber_v2: Optional[AudioTranscriberV2] = None


def get_transcriber_v2() -> AudioTranscriberV2:
    """Get or create V2 transcriber instance."""
    global _transcriber_v2
    if _transcriber_v2 is None:
        model = os.getenv("TRANSCRIBER_MODEL", "whisper-large-v3-turbo")
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