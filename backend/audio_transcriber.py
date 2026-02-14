"""
Real-time audio transcription using Whisper - ANTI-HALLUCINATION VERSION
"""



""" to chnage changeb 399 """
import numpy as np
import sounddevice as sd
import queue
import threading
import re
from typing import Callable, Optional
import time

# Try to import Whisper
try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
    print("✅ Whisper (faster-whisper) available")
except ImportError:
    WHISPER_AVAILABLE = False
    print("⚠️  Whisper not available")

# ============================================================
# HALLUCINATION DETECTION
# ============================================================
# Common Whisper hallucination phrases that appear during silence
HALLUCINATION_PATTERNS = [
    # YouTube/Social media hallucinations
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
    # Music/Sound hallucinations
    r"♪",
    r"🎵",
    r"\[music\]",
    r"\[applause\]",
    r"\[laughter\]",
    r"\[silence\]",
    r"\[inaudible\]",
    # Foreign language hallucinations (common with Whisper)
    r"字幕",
    r"ご視聴",
    r"視聴",
    r"الحمد",
    r"بسم الله",
    r"이 비디오",
    r"구독",
    # Repetition hallucinations
    r"^(.{2,30})\s*\1{2,}$",  # Same phrase repeated 3+ times
    # Initial prompt leak
    r"the speaker is discussing academic topics",
    r"this is a lecture transcription",
    # Generic filler hallucinations
    r"^(um+|uh+|ah+|oh+|hmm+)[\s\.]*$",
    r"^\.+$",
    r"^\s*$",
    # Common nonsense outputs
    r"^you$",
    r"^\.{2,}$",
    r"^I'm going to",
    r"^So,?\s*$",
    r"^And,?\s*$",
    r"^The\s*$",
    r"^It's\s*$",
    # Underscore/blank line hallucinations
    r"_{3,}",  # Three or more underscores in a row
    r"\-{5,}",  # Long dashes
]

# Compile patterns for performance
COMPILED_HALLUCINATION_PATTERNS = [
    re.compile(pattern, re.IGNORECASE) for pattern in HALLUCINATION_PATTERNS
]


def is_hallucination(text: str) -> bool:
    """Check if the transcribed text is a known hallucination pattern"""
    text_stripped = text.strip()
    
    # Too short to be real speech
    if len(text_stripped) < 3:
        return True
    
    # Check against known hallucination patterns
    for pattern in COMPILED_HALLUCINATION_PATTERNS:
        if pattern.search(text_stripped):
            return True
    
    # Check for excessive repetition within the text
    words = text_stripped.lower().split()
    if len(words) >= 4:
        # If more than 50% of words are the same word, it's likely hallucination
        word_counts = {}
        for word in words:
            word_counts[word] = word_counts.get(word, 0) + 1
        max_count = max(word_counts.values())
        if max_count / len(words) > 0.5:
            return True
    
    # Check for repeated phrases (e.g., "I think I think I think")
    if len(words) >= 6:
        # Check bigrams and trigrams for repetition
        for n in [2, 3]:
            if len(words) >= n * 3:
                ngrams = [' '.join(words[i:i+n]) for i in range(len(words) - n + 1)]
                ngram_counts = {}
                for ng in ngrams:
                    ngram_counts[ng] = ngram_counts.get(ng, 0) + 1
                most_common_count = max(ngram_counts.values())
                # If any phrase repeats more than 3 times, it's hallucination
                if most_common_count >= 3:
                    return True
    
    # Check if text is just punctuation or special characters
    alphanumeric = re.sub(r'[^a-zA-Z0-9]', '', text_stripped)
    if len(alphanumeric) < 2:
        return True
    
    return False


def calculate_audio_energy(audio_data: np.ndarray) -> float:
    """Calculate the RMS energy of an audio chunk"""
    return float(np.sqrt(np.mean(audio_data ** 2)))


class AudioTranscriber:
    """Real-time audio transcription with anti-hallucination"""
    
    def __init__(self, model_size: str = "small", device: str = "cuda"):
        self.model_size = model_size
        self.device = device
        self.model: Optional[WhisperModel] = None
        self.is_recording = False
        self.callback: Optional[Callable] = None
        
        # Audio settings
        self.SAMPLE_RATE = 16000
        self.CHANNELS = 1
        self.CHUNK_DURATION = 8  # Process every 8 seconds (longer = more context)
        self.OVERLAP_DURATION = 1.5  # 1.5s overlap to avoid word boundary cuts
        
        # Anti-hallucination settings
        self.MIN_AUDIO_ENERGY = 0.0001  # Minimum RMS energy to process (skip silence)
        self.MIN_AUDIO_LENGTH = 1.5    # Minimum seconds of audio to process
        self.NO_SPEECH_PROB_THRESHOLD = 0.6  # Skip segments with high no_speech probability
        
        # Buffer with overlap support
        self.audio_buffer = []
        self.overlap_buffer = None  # Stores tail end of previous chunk for overlap
        self.last_text = ""
        self.all_transcribed_texts = set()  # Track everything we've sent
        
        # Initialize model
        if WHISPER_AVAILABLE:
            self._load_model()
    
    def _load_model(self):
        """Load Whisper model with fallback"""
        try:
            print(f"🔄 Loading Whisper model: {self.model_size} on {self.device}...")
            # Try loading with requested device (default: cuda)
            compute = "float16" if self.device == "cuda" else "int8"
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=compute
            )
            print(f"✅ Whisper model loaded: {self.model_size} on {self.device}")
        except Exception as e:
            print(f"⚠️ Failed to load on {self.device}: {e}")
            if self.device == "cuda":
                print("🔄 Falling back to CPU...")
                try:
                    self.device = "cpu"
                    self.model = WhisperModel(
                        self.model_size,
                        device="cpu",
                        compute_type="int8"
                    )
                    print(f"✅ Whisper model loaded: {self.model_size} on CPU")
                except Exception as cpu_e:
                    print(f"❌ Failed to load on CPU: {cpu_e}")
                    self.model = None
            else:
                self.model = None
    
    def start_recording(self, callback: Callable[[str], None]):
        """Start recording and transcribing"""
        if not WHISPER_AVAILABLE or not self.model:
            print("❌ Whisper not available")
            return False
        
        self.callback = callback
        self.is_recording = True
        self.audio_buffer = []
        self.overlap_buffer = None
        self.last_text = ""
        self.all_transcribed_texts.clear()
        
        # Start single thread that handles both recording and transcription
        self.process_thread = threading.Thread(target=self._process_audio, daemon=True)
        self.process_thread.start()
        
        print("🎤 Started recording")
        return True
    
    def stop_recording(self):
        """Stop recording"""
        self.is_recording = False
        print("🛑 Stopped recording")
    
    def _process_audio(self):
        """Single thread that records and transcribes with overlap"""
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
                    
                    # Process every CHUNK_DURATION seconds
                    if current_time - last_process_time >= self.CHUNK_DURATION:
                        if self.audio_buffer:
                            # Get buffer and clear
                            buffer_to_process = self.audio_buffer.copy()
                            self.audio_buffer.clear()
                            
                            audio_data = np.concatenate(buffer_to_process)
                            
                            # Prepend overlap from previous chunk to avoid word boundary cuts
                            if self.overlap_buffer is not None:
                                audio_data = np.concatenate([self.overlap_buffer, audio_data])
                            
                            # Save the tail end as overlap for next chunk
                            overlap_samples = int(self.SAMPLE_RATE * self.OVERLAP_DURATION)
                            if len(audio_data) > overlap_samples:
                                self.overlap_buffer = audio_data[-overlap_samples:]
                            
                            # Normalize audio to improve recognition
                            audio_data = self._normalize_audio(audio_data)
                            
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
        """Normalize audio volume to improve recognition of quiet speech"""
        max_val = np.max(np.abs(audio_data))
        if max_val > 0 and max_val < 0.5:
            # Boost quiet audio (but cap at 0.95 to avoid clipping)
            audio_data = audio_data * min(0.95 / max_val, 3.0)
        return audio_data
    
    def _transcribe_chunk(self, audio_data: np.ndarray) -> str:
        """Transcribe a single audio chunk with anti-hallucination"""
        try:
            # Ensure audio is float32
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            
            # Flatten if needed
            if len(audio_data.shape) > 1:
                audio_data = audio_data.flatten()
            
            # Skip if too short (minimum 2 seconds)
            min_samples = int(self.SAMPLE_RATE * self.MIN_AUDIO_LENGTH)
            if len(audio_data) < min_samples:
                print(f"⏭️ Audio too short ({len(audio_data)/self.SAMPLE_RATE:.1f}s), skipping")
                return ""
            
            # Skip if audio energy is too low (silence detection)
            energy = calculate_audio_energy(audio_data)
            if energy < self.MIN_AUDIO_ENERGY:
                print(f"🔇 Audio too quiet (energy={energy:.6f}), skipping")
                return ""
            
            # Transcribe with Whisper - optimized settings
            segments, info = self.model.transcribe(
                audio_data,
                language="en",
                beam_size=5,
                temperature=0.0,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=600,   # Minimum silence for splitting
                    speech_pad_ms=400,             # Extra padding around speech
                    threshold=0.35,                # Lower = captures more speech
                ),
                condition_on_previous_text=True,   # Keep context between segments
                no_speech_threshold=self.NO_SPEECH_PROB_THRESHOLD,
                log_prob_threshold=-1.0,
                initial_prompt="This is a lecture transcription. The speaker is discussing academic topics.",
                hallucination_silence_threshold=2.0,
            )
            
            # Extract text with per-segment filtering
            valid_segments = []
            for segment in segments:
                seg_text = segment.text.strip()
                
                # Skip segments with high no_speech probability
                if segment.no_speech_prob > self.NO_SPEECH_PROB_THRESHOLD:
                    print(f"🔇 SKIPPED low-speech segment (prob={segment.no_speech_prob:.2f}): {seg_text[:40]}")
                    continue
                
                # Skip hallucinated segments
                if is_hallucination(seg_text):
                    print(f"🚫 FILTERED hallucination: {seg_text[:40]}")
                    continue
                
                valid_segments.append(seg_text)
            
            text = " ".join(valid_segments).strip()
            
            if text and len(text) > 2:
                # Final hallucination check on combined text
                if is_hallucination(text):
                    print(f"🚫 FILTERED combined hallucination: {text[:40]}")
                    return ""
                
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
                
                # NEW TEXT - send it
                self.all_transcribed_texts.add(text_lower)
                self.last_text = text
                print(f"✅ NEW: {text}")
                return text
            
        except Exception as e:
            print(f"❌ Transcription error: {e}")
        
        return ""
    
    @staticmethod
    def _similarity(a: str, b: str) -> float:
        """Simple word-based similarity score between two strings"""
        words_a = set(a.split())
        words_b = set(b.split())
        if not words_a or not words_b:
            return 0.0
        intersection = words_a & words_b
        union = words_a | words_b
        return len(intersection) / len(union)

# Global transcriber instance
_transcriber: Optional[AudioTranscriber] = None

def get_transcriber() -> AudioTranscriber:
    """Get or create transcriber instance"""
    global _transcriber
    if _transcriber is None:
        _transcriber = AudioTranscriber(model_size="small", device="cuda")
    return _transcriber

def is_whisper_available() -> bool:
    """Check if Whisper is available"""
    return WHISPER_AVAILABLE
