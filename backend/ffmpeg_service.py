import subprocess
import os

def merge_audio_video(video_path: str, audio_path: str, output_path: str) -> str:
    """
    Given a silent mp4 and an mp3/wav audio track, merge them into a finalized output mp4.
    If the video is shorter than the audio, it cuts off at the shorter boundary. 
    """
    # Delete if pre-existing
    if os.path.exists(output_path):
        os.remove(output_path)

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "libx264",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        output_path
    ]

    print(f"🔧 Running FFmpeg: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

    if result.returncode != 0:
        print(f"❌ FFmpeg merge failed: {result.stderr}")
        raise RuntimeError(f"FFmpeg error: {result.stderr[:500]}")

    if not os.path.exists(output_path):
        raise RuntimeError("FFmpeg completed but output file not found.")

    print(f"✅ Final merged video saved at {output_path}")
    return output_path
