from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.infra.models.job import Job
from app.worker.health import heartbeat_is_fresh, record_heartbeat


def test_worker_heartbeat_is_fresh_after_recording(tmp_path: Path) -> None:
    heartbeat_path = tmp_path / "heartbeat" 
    record_heartbeat(heartbeat_path)
    assert heartbeat_is_fresh(heartbeat_path)

def test_worker_heartbeat_is_not_fresh_when_missing_or_old(tmp_path: Path) -> None:
    heartbeat_path = tmp_path / "heartbeat" 
    assert not heartbeat_is_fresh(heartbeat_path)
    record_heartbeat(heartbeat_path)
    assert not heartbeat_is_fresh(heartbeat_path, now=heartbeat_path.stat().st_mtime + 11)


def test_job_model_can_represent_pending_job() -> None:
    job = Job(
        id=uuid4(),
        kind="test",
        payload={},
        run_after=datetime.now(UTC),
        attempts=0,
        dedupe_key=None,
        locked_at=None,
        completed_at=None,
        last_error=None,
    )

    assert job.completed_at is None
    assert job.locked_at is None
    assert job.attempts == 0
