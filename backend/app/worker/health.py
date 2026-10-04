import sys
import time
from pathlib import Path

HEARTBEAT_PATH = Path("/tmp/schedular-worker-heartbeat")
HEARTBEAT_MAX_SECONDS = 10

def record_heartbeat(path: Path = HEARTBEAT_PATH) -> None:
    path.touch()

def heartbeat_is_fresh(
    path: Path = HEARTBEAT_PATH,
    now: float | None = None,
) -> bool:
    # Determine if the heartbeat file is fresh based on its age
    try:
        age = (time.time() if now is None else now) - path.stat().st_mtime
    except FileNotFoundError:
        return False
    return 0 <= age <= HEARTBEAT_MAX_SECONDS

def main() -> int:
    if heartbeat_is_fresh():
        return 0

    print("worker heartbeat is stale", file=sys.stderr)
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
