"""
Audio Overview — AI Podcast Generation Pipeline
Generates a two-host conversational podcast from lecture transcripts.
Steps: Script Generation → Parse → Kokoro TTS Synthesis → MP3 Export
"""
import os
import re
import json
import tempfile
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

# Directory for podcast files
PODCASTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai", "podcasts")
os.makedirs(PODCASTS_DIR, exist_ok=True)


async def generate_audio_overview(
    session_id: str,
    transcript: str,
    session_title: str,
    context_files_text: str = ""
) -> dict:
    """
    Generate an AI podcast overview of a lecture.
    
    Returns:
        dict with keys: audio_url, script, duration_seconds, error
    """
    result = {
        "audio_url": None,
        "captions_url": None,
        "script": None,
        "duration_seconds": 0.0,
        "error": None
    }
    
    if not transcript or len(transcript.strip()) < 50:
        result["error"] = "Transcript too short to generate audio overview"
        return result

    # Step 1 — Generate podcast script
    print(f"🎙️ Generating podcast script for: {session_title}")
    try:
        script = _generate_script(transcript, session_title, context_files_text)
        if not script:
            result["error"] = "Failed to generate podcast script"
            return result
        result["script"] = script
        print(f"✅ Script generated ({len(script)} chars)")
    except Exception as e:
        result["error"] = f"Script generation failed: {str(e)}"
        print(f"❌ Script generation error: {e}")
        return result

    # Step 2 — Parse script into turns
    turns = _parse_script(script)
    if not turns:
        result["error"] = "Failed to parse podcast script into speaker turns"
        return result
    print(f"✅ Parsed {len(turns)} speaker turns")

    # Step 3 — Synthesize audio with Kokoro TTS
    try:
        from kokoro import KPipeline
    except ImportError:
        result["error"] = "Kokoro TTS not installed. Run: pip install kokoro soundfile"
        print("❌ Kokoro TTS not installed")
        return result

    try:
        import soundfile as sf
    except ImportError:
        result["error"] = "soundfile not installed. Run: pip install soundfile"
        return result

    print("🎧 Synthesizing audio with Kokoro TTS...")
    try:
        pipeline_a = KPipeline(lang_code='a')  # American English

        all_segments = []
        timed_captions = []  # Real timestamps from Kokoro
        sample_rate = 24000
        silence_gap = np.zeros(int(sample_rate * 0.4))  # 0.4s silence between turns
        sample_cursor = 0  # Cumulative sample position

        for i, turn in enumerate(turns):
            voice = 'af_heart' if turn['speaker'] == 'HOST_A' else 'am_adam'
            
            # Record start position before this turn
            turn_start_samples = sample_cursor
            
            try:
                generator = pipeline_a(turn['text'], voice=voice, speed=0.95, split_pattern=r'\n+')
                turn_segments = []
                for gs, ps, audio in generator:
                    if audio is not None:
                        turn_segments.append(audio)
                
                if turn_segments:
                    turn_audio = np.concatenate(turn_segments)
                    all_segments.append(turn_audio)
                    sample_cursor += len(turn_audio)
                    
                    # Record this turn's real timestamps
                    timed_captions.append({
                        "id": len(timed_captions),
                        "speaker": turn['speaker'],
                        "text": turn['text'],
                        "startTime": round(turn_start_samples / sample_rate, 4),
                        "endTime": round(sample_cursor / sample_rate, 4)
                    })
                    
                    # Add silence between turns (not after the last one)
                    if i < len(turns) - 1:
                        all_segments.append(silence_gap)
                        sample_cursor += len(silence_gap)
                    
                    print(f"  ✅ Turn {i+1}/{len(turns)} ({turn['speaker']}): {len(turn_audio)} samples ({timed_captions[-1]['startTime']:.2f}s - {timed_captions[-1]['endTime']:.2f}s)")
            except Exception as e:
                print(f"  ⚠️ Turn {i+1} synthesis error: {e}")
                continue

        if not all_segments:
            result["error"] = "No audio segments were generated"
            return result

        # Concatenate all audio
        full_audio = np.concatenate(all_segments)
        duration_seconds = len(full_audio) / sample_rate
        result["duration_seconds"] = round(duration_seconds, 2)
        print(f"✅ Total audio: {duration_seconds:.1f}s ({len(full_audio)} samples, {len(timed_captions)} captions)")

        # Step 4 — Export to WAV then MP3
        wav_path = os.path.join(tempfile.gettempdir(), f"{session_id}_podcast.wav")
        mp3_path = os.path.join(PODCASTS_DIR, f"{session_id}_podcast.mp3")

        # Write WAV
        sf.write(wav_path, full_audio, sample_rate)
        print(f"✅ WAV written: {wav_path}")

        # Convert to MP3 using pydub
        try:
            from pydub import AudioSegment
            audio_segment = AudioSegment.from_wav(wav_path)
            audio_segment.export(mp3_path, format="mp3", bitrate="128k")
            print(f"✅ MP3 exported: {mp3_path}")
        except ImportError:
            import shutil
            mp3_path = os.path.join(PODCASTS_DIR, f"{session_id}_podcast.wav")
            shutil.copy2(wav_path, mp3_path)
            print(f"⚠️ pydub not available, using WAV: {mp3_path}")
        except Exception as e:
            print(f"⚠️ MP3 conversion error: {e}, using WAV")
            import shutil
            mp3_path = os.path.join(PODCASTS_DIR, f"{session_id}_podcast.wav")
            shutil.copy2(wav_path, mp3_path)

        # Save captions JSON
        captions_path = os.path.join(PODCASTS_DIR, f"{session_id}_captions.json")
        with open(captions_path, 'w') as f:
            json.dump(timed_captions, f, indent=2)
        print(f"✅ Captions saved: {captions_path}")

        # Cleanup temp WAV
        try:
            if os.path.exists(wav_path) and wav_path != mp3_path:
                os.remove(wav_path)
        except:
            pass

        filename = os.path.basename(mp3_path)
        result["audio_url"] = f"/api/audio/{filename}"
        result["captions_url"] = f"/api/audio/{session_id}_captions.json"
        print(f"✅ Audio overview complete: {result['audio_url']}")

    except Exception as e:
        result["error"] = f"Audio synthesis failed: {str(e)}"
        print(f"❌ Audio synthesis error: {e}")
        import traceback
        traceback.print_exc()

    return result


def _generate_script(transcript: str, session_title: str, context_files_text: str = "") -> str:
    """Generate a two-host podcast script using Groq."""
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    if not client:
        return ""

    system_prompt = """You are a World Class Podcast Script Writer. Write a natural, engaging two-host educational podcast script based on the provided lecture transcript. The podcast should feel like two knowledgeable friends discussing the topic — not a formal lecture. Include natural conversational elements like brief acknowledgments, building on each other's points, and occasional analogies. Do not invent facts not in the transcript."""

    context_section = ""
    has_context = False
    if context_files_text and context_files_text.strip():
        context_section = f"\n\nAdditional context from uploaded files:\n{context_files_text}"
        has_context = True

    # Scale podcast length: standard ~4 mins, but if transcript is long AND we have context, allow up to 10 mins
    if has_context and len(transcript) > 8000:
        word_target = "1500-2000 words of actual spoken dialogue (this creates an up to 10-minute podcast)"
    else:
        word_target = "800-1200 words of actual spoken dialogue (this creates a 4-5 minute podcast)"

    user_prompt = f"""Write a podcast script for a lecture about: {session_title}

The script should be {word_target} (not counting speaker labels).
Format: alternate between exactly two speakers labeled HOST_A and HOST_B.
Start with HOST_A introducing the topic naturally.
End with HOST_B giving a brief closing summary.

Rules:
- Each speaking turn: 4-6 sentences
- Natural transitions ("Exactly", "Right", "And that's interesting because", "So basically")
- Explain concepts as if to a smart friend, not a student
- No bullet points, no headers, just dialogue
- Do not include sound effects or music cues

Respond ONLY with the script, no other text. Format exactly:
HOST_A: [dialogue here]
HOST_B: [dialogue here]
HOST_A: [dialogue here]
...

Transcript:
{transcript}{context_section}"""

    try:
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="moonshotai/kimi-k2-instruct-0905",
            temperature=0.7,
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        print(f"❌ Script generation Groq error: {e}")
        return ""


def _parse_script(script: str) -> list[dict]:
    """Parse a podcast script into speaker turns."""
    turns = []
    current_speaker = None
    current_text = []

    for line in script.split('\n'):
        line = line.strip()
        if not line:
            continue

        # Check for speaker label
        match = re.match(r'^(HOST_[AB]):\s*(.*)', line)
        if match:
            # Save previous turn
            if current_speaker and current_text:
                turns.append({
                    "speaker": current_speaker,
                    "text": ' '.join(current_text)
                })
            current_speaker = match.group(1)
            current_text = [match.group(2)] if match.group(2) else []
        elif current_speaker:
            # Continuation of current speaker's turn
            current_text.append(line)

    # Save last turn
    if current_speaker and current_text:
        turns.append({
            "speaker": current_speaker,
            "text": ' '.join(current_text)
        })

    return turns


def check_podcast_exists(session_id: str) -> dict:
    """Check if a podcast file already exists for a session."""
    for ext in ['.mp3', '.wav']:
        filepath = os.path.join(PODCASTS_DIR, f"{session_id}_podcast{ext}")
        if os.path.exists(filepath):
            filename = os.path.basename(filepath)
            captions_path = os.path.join(PODCASTS_DIR, f"{session_id}_captions.json")
            captions_url = f"/api/audio/{session_id}_captions.json" if os.path.exists(captions_path) else None
            return {
                "exists": True,
                "audio_url": f"/api/audio/{filename}",
                "captions_url": captions_url
            }
    return {
        "exists": False,
        "audio_url": None,
        "captions_url": None
    }
