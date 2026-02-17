"""
File-based audio transcription test script.

Usage:
    # Full transcript at once (default):
    python transcribe_file.py path/to/audio.mp3

    # Chunk-by-chunk output:
    python transcribe_file.py path/to/audio.mp3 --chunked

    # With a topic for better keyword prompting:
    python transcribe_file.py path/to/audio.mp3 --topic "Operating Systems"

    # Combine both:
    python transcribe_file.py path/to/audio.mp3 --chunked --topic "Data Structures"
"""

import argparse
import sys
import os
import time
import numpy as np

# Ensure imports work from backend directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from audio_transcriber import AudioTranscriber, calculate_audio_energy

# ============================================================
# AUDIO FILE LOADING
# ============================================================

def load_audio_file(file_path: str, target_sr: int = 16000) -> np.ndarray:
    """
    Load an audio file and resample to target sample rate (16kHz mono).
    Supports: mp3, wav, m4a, ogg, webm, flac, etc.
    
    Returns:
        numpy array of float32 audio samples at target_sr
    """
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        sys.exit(1)
    
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    print(f"📂 Loading: {file_path} ({file_size_mb:.1f} MB)")
    
    try:
        import librosa
        audio, sr = librosa.load(file_path, sr=target_sr, mono=True)
        print(f"✅ Loaded audio: {len(audio)/target_sr:.1f}s, {target_sr}Hz, mono")
        return audio.astype(np.float32)
    except ImportError:
        pass

    # Fallback: soundfile (wav/flac only, no mp3)
    try:
        import soundfile as sf
        audio, sr = sf.read(file_path, dtype='float32')
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)  # stereo to mono
        if sr != target_sr:
            # Simple resampling via numpy interpolation
            duration = len(audio) / sr
            target_len = int(duration * target_sr)
            audio = np.interp(
                np.linspace(0, len(audio), target_len),
                np.arange(len(audio)),
                audio
            ).astype(np.float32)
        print(f"✅ Loaded audio: {len(audio)/target_sr:.1f}s, {target_sr}Hz, mono")
        return audio
    except ImportError:
        pass

    print("❌ No audio loading library found!")
    print("   Install one of: pip install librosa  OR  pip install soundfile")
    sys.exit(1)


# ============================================================
# CHUNKING
# ============================================================

def chunk_audio(audio: np.ndarray, sr: int, chunk_duration: float, overlap_duration: float):
    """
    Split audio into overlapping chunks, mimicking the live recording pipeline.
    
    Yields:
        (chunk_index, chunk_audio_np_array)
    """
    chunk_samples = int(sr * chunk_duration)
    overlap_samples = int(sr * overlap_duration)
    step_samples = chunk_samples - overlap_samples  # how far to advance each step

    total_samples = len(audio)
    start = 0
    chunk_idx = 0

    while start < total_samples:
        end = min(start + chunk_samples, total_samples)
        chunk = audio[start:end]

        # Skip very short trailing chunks (< 1.5s)
        if len(chunk) < int(sr * 1.5):
            break

        yield chunk_idx, chunk
        chunk_idx += 1
        start += step_samples


# ============================================================
# MODE 1: FULL TRANSCRIPT
# ============================================================

def transcribe_full(transcriber: AudioTranscriber, audio: np.ndarray):
    """
    Transcribe the entire audio and return the complete transcript at once.
    Chunks internally but only prints the final result.
    """
    sr = transcriber.SAMPLE_RATE
    chunk_dur = transcriber.CHUNK_DURATION
    overlap_dur = transcriber.OVERLAP_DURATION

    chunks = list(chunk_audio(audio, sr, chunk_dur, overlap_dur))
    total_chunks = len(chunks)

    print(f"\n{'='*60}")
    print(f"  MODE: Full Transcript")
    print(f"  Audio duration: {len(audio)/sr:.1f}s")
    print(f"  Chunks: {total_chunks} (each ~{chunk_dur}s with {overlap_dur}s overlap)")
    print(f"{'='*60}\n")

    all_texts = []
    start_time = time.time()

    for idx, chunk in chunks:
        # Normalize (same as live pipeline)
        chunk = transcriber._normalize_audio(chunk)
        text = transcriber._transcribe_chunk(chunk)
        if text:
            all_texts.append(text)
        # Progress bar
        progress = (idx + 1) / total_chunks * 100
        print(f"  ⏳ Progress: {idx+1}/{total_chunks} ({progress:.0f}%)")

    elapsed = time.time() - start_time
    full_transcript = " ".join(all_texts)

    print(f"\n{'='*60}")
    print(f"  ✅ TRANSCRIPTION COMPLETE")
    print(f"  Time taken: {elapsed:.1f}s")
    print(f"  Chunks processed: {total_chunks}")
    print(f"  Chunks with speech: {len(all_texts)}")
    print(f"  Transcript length: {len(full_transcript)} chars")
    print(f"{'='*60}")
    print(f"\n📝 FULL TRANSCRIPT:\n")
    print(full_transcript)
    print()

    return full_transcript


# ============================================================
# MODE 2: CHUNK-BY-CHUNK
# ============================================================

def transcribe_chunked(transcriber: AudioTranscriber, audio: np.ndarray):
    """
    Transcribe and print each chunk individually as it's processed.
    Shows chunk timing, energy, and hallucination filter decisions.
    """
    sr = transcriber.SAMPLE_RATE
    chunk_dur = transcriber.CHUNK_DURATION
    overlap_dur = transcriber.OVERLAP_DURATION

    chunks = list(chunk_audio(audio, sr, chunk_dur, overlap_dur))
    total_chunks = len(chunks)

    print(f"\n{'='*60}")
    print(f"  MODE: Chunk-by-Chunk")
    print(f"  Audio duration: {len(audio)/sr:.1f}s")
    print(f"  Chunks: {total_chunks} (each ~{chunk_dur}s with {overlap_dur}s overlap)")
    print(f"{'='*60}\n")

    all_texts = []
    start_time = time.time()

    for idx, chunk in chunks:
        chunk_start_sec = idx * (chunk_dur - overlap_dur)
        chunk_end_sec = chunk_start_sec + len(chunk) / sr
        energy = calculate_audio_energy(chunk)

        print(f"\n{'─'*50}")
        print(f"  🔊 CHUNK {idx+1}/{total_chunks}")
        print(f"  Time: {chunk_start_sec:.1f}s → {chunk_end_sec:.1f}s")
        print(f"  Duration: {len(chunk)/sr:.1f}s | Energy: {energy:.6f}")
        print(f"{'─'*50}")

        # Normalize (same as live pipeline)
        chunk = transcriber._normalize_audio(chunk)
        text = transcriber._transcribe_chunk(chunk)

        if text:
            all_texts.append(text)
            print(f"  📝 TEXT: {text}")
        else:
            print(f"  ⏭️  (no speech / filtered)")

    elapsed = time.time() - start_time
    full_transcript = " ".join(all_texts)

    print(f"\n{'='*60}")
    print(f"  ✅ ALL CHUNKS PROCESSED")
    print(f"  Time taken: {elapsed:.1f}s")
    print(f"  Chunks with speech: {len(all_texts)}/{total_chunks}")
    print(f"{'='*60}")
    print(f"\n📝 COMBINED TRANSCRIPT:\n")
    print(full_transcript)
    print()

    return full_transcript


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Transcribe an audio file using Whisper with anti-hallucination filtering.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python transcribe_file.py lecture.mp3
  python transcribe_file.py lecture.mp3 --chunked
  python transcribe_file.py lecture.mp3 --topic "Operating Systems"
  python transcribe_file.py lecture.mp3 --chunked --topic "Data Structures"
  python transcribe_file.py lecture.wav --model medium --device cpu
        """
    )
    parser.add_argument("audio_file", help="Path to the audio file (mp3, wav, m4a, etc.)")
    parser.add_argument("--chunked", action="store_true",
                        help="Show chunk-by-chunk output instead of full transcript")
    parser.add_argument("--topic", type=str, default="",
                        help="Lecture topic for better keyword prompting (e.g. 'Operating Systems')")
    parser.add_argument("--model", type=str, default="small",
                        help="Whisper model size: tiny, base, small, medium, large (default: small)")
    parser.add_argument("--device", type=str, default="cuda",
                        help="Device: cuda or cpu (default: cuda)")
    parser.add_argument("--output", type=str, default=None,
                        help="Save transcript to a text file")

    args = parser.parse_args()

    # Initialize transcriber
    print(f"\n🚀 Initializing Whisper ({args.model}) on {args.device}...")
    transcriber = AudioTranscriber(model_size=args.model, device=args.device)

    if transcriber.model is None:
        print("❌ Failed to load Whisper model. Exiting.")
        sys.exit(1)

    # Set topic if provided
    if args.topic:
        transcriber.set_topic(args.topic)

    # Load audio file
    audio = load_audio_file(args.audio_file, target_sr=transcriber.SAMPLE_RATE)

    # Run transcription
    if args.chunked:
        transcript = transcribe_chunked(transcriber, audio)
    else:
        transcript = transcribe_full(transcriber, audio)

    # Save to file if requested
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(transcript)
        print(f"💾 Transcript saved to: {args.output}")


if __name__ == "__main__":
    main()
