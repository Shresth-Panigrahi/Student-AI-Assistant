import subprocess
import numpy as np
from audio_transcriber_v4 import get_transcriber_v4

file_path = "/Users/shresthpanigrahi/Desktop/AI ASSISTANT/Voice 007.m4a"
print(f"Decoding {file_path} to 16kHz float32 mono...")

cmd = [
    "ffmpeg", "-i", file_path,
    "-f", "f32le", "-ac", "1", "-ar", "16000",
    "pipe:1"
]
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
audio_bytes, _ = proc.communicate()

if proc.returncode != 0:
    print("FFmpeg decoding failed.")
    exit(1)

audio_data = np.frombuffer(audio_bytes, dtype=np.float32)
duration = len(audio_data) / 16000
print(f"Audio loaded: {duration:.2f} seconds")

# Get our V4 transcriber singleton (starts bridge)
print("Initializing Transcriber V4...")
t = get_transcriber_v4()

out_path = "/Users/shresthpanigrahi/Desktop/AI ASSISTANT/Voice_007_Transcript.txt"

# Give bridge a bit more time if needed, though get_transcriber_v4 is synchronous
import time
time.sleep(1)

print(f"\nStarting simulated chunked processing. Saving to {out_path}...\n")
chunk_size = 16000 * 8
overlap_size = int(16000 * 1.5)
step_size = chunk_size - overlap_size

# Initialize file
with open(out_path, "w") as f:
    f.write(f"--- Full Transcript for {file_path} ---\n\n")

for i in range(0, len(audio_data), step_size):
    chunk = audio_data[i:i + chunk_size]
    if len(chunk) < 16000 * 1.5:  # skip tail ends less than MIN_AUDIO_LENGTH
        break
    
    # Simulate V4's normalization
    max_val = np.max(np.abs(chunk))
    if 0 < max_val < 0.5:
        chunk = chunk * min(0.95 / max_val, 3.0)
    
    text = t._transcribe_chunk(chunk)
    if text:
        with open(out_path, "a") as f:
            f.write(text + " ")
        print(f"[{i/16000:.1f}s] {text}")

print("\n" + "="*50)
print(f"FINISHED. Saved to {out_path}")
print("="*50)
