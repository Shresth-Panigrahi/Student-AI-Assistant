from __future__ import annotations

import os
import sys
from pathlib import Path


def resolve_runtime_backend_dir() -> Path:
    env_dir = os.getenv("LECTURE_LYFT_RUNTIME_BACKEND_DIR")
    if env_dir:
        return Path(env_dir).resolve()

    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent

    return Path(__file__).resolve().parents[2] / "backend"


BACKEND_DIR = resolve_runtime_backend_dir()
os.chdir(BACKEND_DIR)

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402
import uvicorn  # noqa: E402


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.getenv("LECTURE_LYFT_BACKEND_HOST", "127.0.0.1"),
        port=int(os.getenv("LECTURE_LYFT_BACKEND_PORT", "8000")),
        log_level=os.getenv("LECTURE_LYFT_BACKEND_LOG_LEVEL", "info"),
    )
