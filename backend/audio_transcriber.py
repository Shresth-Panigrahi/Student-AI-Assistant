"""
Real-time audio transcription using Whisper - NO REPETITION VERSION
"""
import numpy as np
import sounddevice as sd
import queue
import threading
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

class AudioTranscriber:
    """Real-time audio transcription with NO repetition"""
    
    def __init__(self, model_size: str = "base", device: str = "cpu"):
        self.model_size = model_size
        self.device = device
        self.model: Optional[WhisperModel] = None
        self.is_recording = False
        self.callback: Optional[Callable] = None
        
        # Audio settings
        self.SAMPLE_RATE = 16000
        self.CHANNELS = 1
        self.CHUNK_DURATION = 5  # Process every 5 seconds
        
        # Simple buffer - NO OVERLAP
        self.audio_buffer = []
        self.last_text = ""
        self.all_transcribed_texts = set()  # Track everything we've sent
        
        # Initialize model
        if WHISPER_AVAILABLE:
            self._load_model()
    
    def _load_model(self):
        """Load Whisper model"""
        try:
            print(f"🔄 Loading Whisper model: {self.model_size}")
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type="int8"
            )
            print(f"✅ Whisper model loaded: {self.model_size}")
        except Exception as e:
            print(f"❌ Failed to load Whisper model: {e}")
            self.model = None
    
    def start_recording(self, callback: Callable[[str], None]):
        """Start recording and transcribing"""
        if not WHISPER_AVAILABLE or not self.model:
            print("❌ Whisper not available")
            return False
        
        self.callback = callback
        self.is_recording = True
        self.audio_buffer = []
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
        """Single thread that records and transcribes - NO OVERLAP"""
        print("🎧 Audio processing started")
        
        def audio_callback(indata, frames, time_info, status):
            if status:
                print(f"⚠️  Audio status: {status}")
            if self.is_recording:
                # Just collect audio
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
                            # Get buffer and CLEAR IT IMMEDIATELY
                            buffer_to_process = self.audio_buffer.copy()
                            self.audio_buffer.clear()  # CLEAR NOW!
                            
                            # Process in this thread (no queue, no overlap)
                            audio_data = np.concatenate(buffer_to_process)
                            text = self._transcribe_chunk(audio_data)
                            
                            if text and self.callback:
                                self.callback(text)
                            
                            last_process_time = current_time
                    
                    time.sleep(0.1)  # Small sleep to prevent CPU spinning
                    
        except Exception as e:
            print(f"❌ Processing error: {e}")
        
        print("📝 Audio processing stopped")
    
    def _transcribe_chunk(self, audio_data: np.ndarray) -> str:
        """Transcribe a single audio chunk"""
        try:
            # Ensure audio is float32
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            
            # Flatten if needed
            if len(audio_data.shape) > 1:
                audio_data = audio_data.flatten()
            
            # Skip if too short
            if len(audio_data) < self.SAMPLE_RATE:  # Less than 1 second
                return ""
            
            # Transcribe with Whisper
            segments, info = self.model.transcribe(
                audio_data,
                language="en",
                beam_size=5,
                temperature=0.0,
                vad_filter=True,
                condition_on_previous_text=False  # NO CONTEXT
            )
            
            # Extract text
            text = " ".join([segment.text for segment in segments]).strip()
            
            if text and len(text) > 2:
                # Check if we've already sent this exact text
                text_lower = text.lower().strip()
                
                if text_lower in self.all_transcribed_texts:
                    print(f"🔄 SKIPPED duplicate: {text[:40]}...")
                    return ""
                
                # Check if it's the same as last text
                if text_lower == self.last_text.lower().strip():
                    print(f"🔄 SKIPPED same as last: {text[:40]}...")
                    return ""
                
                # NEW TEXT - send it
                self.all_transcribed_texts.add(text_lower)
                self.last_text = text
                print(f"✅ NEW: {text}")
                return text
            
        except Exception as e:
            print(f"❌ Transcription error: {e}")
        
        return ""

# Global transcriber instance
_transcriber: Optional[AudioTranscriber] = None

def get_transcriber() -> AudioTranscriber:
    """Get or create transcriber instance"""
    global _transcriber
    if _transcriber is None:
        _transcriber = AudioTranscriber(model_size="base", device="cpu")
    return _transcriber

def is_whisper_available() -> bool:
    """Check if Whisper is available"""
    return WHISPER_AVAILABLE
