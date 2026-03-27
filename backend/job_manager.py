import os
from datetime import datetime
from typing import Dict, Optional

# Since the user requested a unified job manager, we can overlay it
# slightly over the mongo structure or keep it standalone memory-based for simplicity.
# The specs state a mandatory job format. 

# We'll use memory-based dict for the job states in this immediate implementation,
# but it could easily wrap `database_mongo.py` updates.

_JOBS: Dict[str, Dict] = {}

def create_or_update_job(session_id: str, status: str, progress: int, message: str, video_url: Optional[str] = None) -> None:
    """
    Format:
    {
      session_id,
      status: "queued | generating | rendering | audio | merging | complete | failed",
      progress: 0-100,
      message: "string",
      video_url: "url or null"
    }
    """
    _JOBS[session_id] = {
        "session_id": session_id,
        "status": status,
        "progress": progress,
        "message": message,
        "video_url": video_url,
        "updated_at": datetime.now().isoformat()
    }
    print(f"📽️ [{session_id}] {progress}% | {status}: {message}")

def get_job_status(session_id: str) -> Optional[Dict]:
    job = _JOBS.get(session_id)
    if job:
        return {
            "session_id": job["session_id"],
            "status": job["status"],
            "progress": job["progress"],
            "message": job["message"],
            "video_url": job["video_url"]
        }
    return None

def fail_job(session_id: str, error_message: str):
    create_or_update_job(session_id, "failed", 0, error_message)
