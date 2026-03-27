import os
import numpy as np
import tempfile

def generate_narration(transcript: str, session_id: str) -> str:
    """
    Generate TTS narration from the provided transcript using Kokoro.
    Returns the path to the resulting MP3.
    """
    try:
        from kokoro import KPipeline
        import soundfile as sf
    except ImportError:
        raise RuntimeError("Kokoro or soundfile not installed.")

    # We summarize or chunk the transcript to make a good script
    # To keep it simple, let's process the transcript directly if it's not too long
    # Or rely on the LLM from earlier to provide a short summary script...
    # For now, we narrate a segment of the transcript so it's around 2-3 minutes max
    narration_text = transcript[:3000].strip()

    print(f"🎙️ Synthesizing {len(narration_text)} chars of audio...")

    pipeline = KPipeline(lang_code='a')
    voice = 'af_heart'
    sample_rate = 24000

    all_segments = []
    generator = pipeline(narration_text, voice=voice, speed=0.95, split_pattern=r'\n+')

    for gs, ps, audio in generator:
        if audio is not None:
            all_segments.append(audio)

    if not all_segments:
        raise RuntimeError("Kokoro produced no audio segments.")

    full_audio = np.concatenate(all_segments)
    
    # Write WAV to temp file, then encode to MP3
    output_wav = os.path.join(tempfile.gettempdir(), f"{session_id}_narration.wav")
    output_mp3 = os.path.join(tempfile.gettempdir(), f"{session_id}_narration.mp3")

    sf.write(output_wav, full_audio, sample_rate)

    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_wav(output_wav)
        audio.export(output_mp3, format="mp3", bitrate="128k")
        if os.path.exists(output_wav):
            os.remove(output_wav)
        return output_mp3
    except ImportError:
        # Fallback to wav if pydub/ffmpeg missing
        return output_wav
