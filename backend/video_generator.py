import os
import asyncio
import tempfile
import traceback

from job_manager import create_or_update_job, fail_job
from llm_service import generate_video_script
from html_renderer import create_html_for_playwright
from tts_service import generate_narration
from video_recorder import record_html_video
from ffmpeg_service import merge_audio_video

# Config
VIDEOS_DIR = os.path.join(os.path.dirname(__file__), "videos")
os.makedirs(VIDEOS_DIR, exist_ok=True)

async def _render_video_and_audio(session_id: str, transcript: str, html_file_path: str):
    """
    Run Playwright Video Recording and Kokoro TTS in parallel.
    """
    raw_video_path = os.path.join(tempfile.gettempdir(), f"{session_id}_raw.webm")
    # Default extension for playwright video might be .webm; we'll force .mp4 in output name
    raw_video_path = raw_video_path.replace(".webm", ".mp4")
    
    # We run audio generation in a thread since it's synchronous CPU heavy code
    loop = asyncio.get_event_loop()
    
    create_or_update_job(session_id, "rendering", 30, "Recording HTML animations & generating voiceover...")
    
    # Run in parallel
    video_task = asyncio.create_task(record_html_video(html_file_path, raw_video_path))
    audio_task = loop.run_in_executor(None, generate_narration, transcript, session_id)
    
    video_out, audio_out = await asyncio.gather(video_task, audio_task)
    return video_out, audio_out


async def run_pipeline(session_id: str, session_title: str, transcript: str):
    """
    Pipeline: Transcript -> JSON -> HTML -> VP/TTS -> FFmpeg
    """
    create_or_update_job(session_id, "generating", 10, "Extracting structured JSON script from transcript...")
    
    try:
        # Step 1: Generate Script JSON
        loop = asyncio.get_event_loop()
        script_data = await loop.run_in_executor(None, generate_video_script, transcript, session_title)
        
        # Step 2: Render HTML Template
        create_or_update_job(session_id, "rendering", 25, "Compiling HTML and GSAP animations...")
        html_file = os.path.join(tempfile.gettempdir(), f"{session_id}_render.html")
        await loop.run_in_executor(None, create_html_for_playwright, script_data, html_file)
        
        # Step 3: Record Video (Playwright) & Narration (TTS)
        raw_video, raw_audio = await _render_video_and_audio(session_id, transcript, html_file)
        
        # Step 4: Merge AV via FFmpeg
        create_or_update_job(session_id, "merging", 80, "Multiplexing final video and narration streams...")
        final_mp4 = os.path.join(VIDEOS_DIR, f"{session_id}.mp4")
        
        await loop.run_in_executor(None, merge_audio_video, raw_video, raw_audio, final_mp4)
        
        # Finish
        filename = os.path.basename(final_mp4)
        video_url = f"/api/video/{filename}"
        create_or_update_job(session_id, "complete", 100, "Done!", video_url=video_url)
        
        # Cleanup
        for f in [html_file, raw_video, raw_audio]:
            try:
                if os.path.exists(f): os.remove(f)
            except: pass

    except Exception as e:
        import traceback
        traceback.print_exc()
        fail_job(session_id, str(e))

def start_video_generation(session_id: str, session_title: str, transcript: str):
    """
    Fire-and-forget orchestrator trigger.
    """
    create_or_update_job(session_id, "queued", 5, "Initializing video generation pipeline...")
    asyncio.create_task(run_pipeline(session_id, session_title, transcript))
