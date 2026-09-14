from datetime import UTC, datetime
from uuid import uuid4

from app.infra.models.job import Job


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
