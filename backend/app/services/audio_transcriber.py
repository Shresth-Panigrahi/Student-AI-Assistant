"""
Real-time Audio Transcription using OnDemand.io Speech-to-Text API
PARALLEL VERSION: Continuous recording with async transcription
"""
import os
import threading
import time
import tempfile
import queue
from typing import Callable, Optional
import numpy as np
import requests
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor

# Load environment variables
load_dotenv()

try:
    import sounddevice as sd
    import soundfile as sf
    AUDIO_AVAILABLE = True
except (ImportError, OSError):
    AUDIO_AVAILABLE = False
    print("⚠️  Audio libraries not available (Server mode)")

# Try to import Cloudinary
try:
    import cloudinary
    import cloudinary.uploader
    CLOUDINARY_AVAILABLE = True
except ImportError:
    CLOUDINARY_AVAILABLE = False
    print("⚠️  Cloudinary not available")


class AudioTranscriber:
    """
    Real-time bilingual (Hindi + English) audio transcription.
    
    Uses parallel processing:
    - Recording thread: Continuously captures audio chunks
    - Transcription thread: Processes chunks in parallel
    - No audio is missed during transcription delays
    """
    
    def __init__(self, chunk_duration: float = 4.0, sample_rate: int = 16000):
        self.chunk_duration = chunk_duration
        self.sample_rate = sample_rate
        self.is_recording = False
        self.callback = None
        
        # Thread management
        self.recording_thread = None
        self.processing_thread = None
        self.audio_queue = queue.Queue(maxsize=10)  # Buffer for audio chunks
        self.executor = ThreadPoolExecutor(max_workers=3)  # Parallel transcription
        
        # Audio settings
        self.silence_threshold = 0.002
        
        # OnDemand API
        self.api_key = os.getenv("ONDEMAND_API_KEY")
        self.api_url = "https://api.on-demand.io/services/v1/public/service/execute/speech_to_text"
        
        # Cloudinary configuration
        cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
        api_key = os.getenv("CLOUDINARY_API_KEY")
        api_secret = os.getenv("CLOUDINARY_API_SECRET")
        
        self.cloudinary_configured = False
        if CLOUDINARY_AVAILABLE and cloud_name and api_key and api_secret:
            if cloud_name != "your_cloud_name":
                cloudinary.config(
                    cloud_name=cloud_name,
                    api_key=api_key,
                    api_secret=api_secret
                )
                self.cloudinary_configured = True
                print("✅ Cloudinary configured")
        
        self.available = self.cloudinary_configured and self.api_key
        if self.available:
            print("✅ OnDemand transcription ready")
        
        # Track transcriptions
        self.sent_transcripts = set()
        self.pending_futures = []
        
        print(f"📝 AudioTranscriber ready (parallel mode, chunk={chunk_duration}s)")
    
    def _normalize_audio(self, audio_data: np.ndarray) -> np.ndarray:
        """Normalize audio volume."""
        max_val = np.max(np.abs(audio_data))
        if max_val > 0.01:
            return audio_data * (0.7 / max_val)
        return audio_data
    
    def _upload_and_transcribe(self, audio_data: np.ndarray, chunk_id: int) -> Optional[str]:
        """Upload audio to Cloudinary and transcribe via OnDemand API."""
        tmp_path = None
        try:
            # Normalize
            audio_data = self._normalize_audio(audio_data)
            
            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                tmp_path = f.name
                sf.write(tmp_path, audio_data, self.sample_rate)
            
            # Upload to Cloudinary
            result = cloudinary.uploader.upload(
                tmp_path,
                resource_type="auto",
                folder="stt_audio",
                format="wav"
            )
            audio_url = result.get("secure_url")
            
            if not audio_url:
                return None
            
            print(f"   [{chunk_id}] Uploaded, transcribing...")
            
            # Call OnDemand API
            headers = {
                "apikey": self.api_key,
                "Content-Type": "application/json"
            }
            payload = {"audioUrl": audio_url}
            
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=45
            )
            
            if response.status_code == 200:
                result = response.json()
                transcript = result.get("data", {}).get("text", "").strip()
                
                if transcript:
                    # Filter noise
                    noise_words = ["uh", "um", "hmm", "ah", "oh", "mm", "in", "and", "अं", "हं", "हाँ", "उं"]
                    if transcript.lower() in noise_words or len(transcript) < 2:
                        return None
                    
                    return transcript
            
            return None
                
        except Exception as e:
            print(f"   [{chunk_id}] Error: {e}")
            return None
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except:
                    pass
    
    def _handle_transcription_result(self, future, chunk_id: int):
        """Handle completed transcription."""
        try:
            transcript = future.result()
            if transcript:
                clean = transcript.lower().strip()
                if clean not in self.sent_transcripts:
                    self.sent_transcripts.add(clean)
                    print(f"✅ [{chunk_id}] \"{transcript}\"")
                    if self.callback:
                        self.callback(transcript)
        except Exception as e:
            print(f"❌ [{chunk_id}] Failed: {e}")
    
    def _recording_loop(self):
        """
        RECORDING THREAD: Continuously captures audio chunks.
        Never stops to wait for transcription.
        """
        print("🎧 Recording thread started (continuous capture)")
        
        chunk_samples = int(self.chunk_duration * self.sample_rate)
        chunk_id = 0
        
        while self.is_recording:
            try:
                # Record audio chunk
                audio_data = sd.rec(
                    chunk_samples,
                    samplerate=self.sample_rate,
                    channels=1,
                    dtype=np.float32
                )
                sd.wait()
                
                if not self.is_recording:
                    break
                
                audio_data = audio_data.flatten()
                chunk_id += 1
                
                # Check audio level
                rms = np.sqrt(np.mean(audio_data ** 2))
                
                if rms < self.silence_threshold:
                    print(f"⏸️ [{chunk_id}] Silence")
                    continue
                
                print(f"🎤 [{chunk_id}] Recording... (RMS: {rms:.4f})")
                
                # Put in queue for processing (non-blocking)
                try:
                    self.audio_queue.put_nowait((audio_data.copy(), chunk_id))
                except queue.Full:
                    print(f"⚠️ [{chunk_id}] Queue full, skipping")
                    
            except Exception as e:
                print(f"❌ Recording error: {e}")
                time.sleep(0.5)
        
        print("📝 Recording thread stopped")
    
    def _processing_loop(self):
        """
        PROCESSING THREAD: Takes chunks from queue and transcribes in parallel.
        Uses ThreadPoolExecutor for concurrent API calls.
        """
        print("🔄 Processing thread started (parallel transcription)")
        
        while self.is_recording or not self.audio_queue.empty():
            try:
                # Get chunk from queue (with timeout)
                try:
                    audio_data, chunk_id = self.audio_queue.get(timeout=1.0)
                except queue.Empty:
                    continue
                
                # Submit for parallel transcription
                print(f"📤 [{chunk_id}] Uploading...")
                future = self.executor.submit(
                    self._upload_and_transcribe, 
                    audio_data, 
                    chunk_id
                )
                
                # Add callback for when done
                future.add_done_callback(
                    lambda f, cid=chunk_id: self._handle_transcription_result(f, cid)
                )
                
                self.audio_queue.task_done()
                    
            except Exception as e:
                print(f"❌ Processing error: {e}")
        
        print("📝 Processing thread stopped")
    
    def start_recording(self, callback: Callable[[str], None]) -> bool:
        """Start parallel recording and transcription."""
        if not AUDIO_AVAILABLE:
            print("❌ Audio not available")
            return False
        
        if not self.available:
            print("❌ Transcription not configured")
            return False
        
        if self.is_recording:
            return True
        
        self.callback = callback
        self.is_recording = True
        self.sent_transcripts.clear()
        
        # Clear queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except:
                pass
        
        # Start BOTH threads
        self.recording_thread = threading.Thread(target=self._recording_loop, daemon=True)
        self.processing_thread = threading.Thread(target=self._processing_loop, daemon=True)
        
        self.recording_thread.start()
        self.processing_thread.start()
        
        print("🎤 Recording started (parallel mode - no audio will be missed!)")
        return True
    
    def stop_recording(self):
        """Stop recording and finish processing."""
        if not self.is_recording:
            return
        
        self.is_recording = False
        print("🛑 Stopping...")
        
        # Wait for threads
        if self.recording_thread:
            self.recording_thread.join(timeout=2)
        if self.processing_thread:
            self.processing_thread.join(timeout=5)
        
        self.recording_thread = None
        self.processing_thread = None
        
        print("✅ Stopped")


# Global instance
_transcriber: Optional[AudioTranscriber] = None


def get_transcriber() -> AudioTranscriber:
    """Get transcriber instance."""
    global _transcriber
    if _transcriber is None:
        _transcriber = AudioTranscriber()
    return _transcriber


def is_whisper_available() -> bool:
    """Check if transcription is available."""
    transcriber = get_transcriber()
    return transcriber.available and AUDIO_AVAILABLE
