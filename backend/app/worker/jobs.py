from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.infra.models.job import Job


def claim_job(
    db: Session,
) -> Job | None:
    now = datetime.now(UTC)

    job = db.scalar(
        select(Job)
        .where(
            Job.completed_at.is_(None),
            Job.run_after <= now,
            Job.locked_at.is_(None),
        )
        .order_by(
            Job.run_after,
            Job.id,
        )
        .with_for_update(skip_locked=True)
        .limit(1)
    )

    if job is None:
        db.commit()
        return None

    job.locked_at = now
    job.attempts += 1

    db.commit()
    db.refresh(job)

    return job


def complete_job(
    db: Session,
    job: Job,
) -> None:
    job.completed_at = datetime.now(UTC)
    job.locked_at = None
    job.last_error = None

    db.commit()


def retry_job(
    db: Session,
    job: Job,
    error: Exception,
) -> None:
    delay_seconds = min(
        60 * (2 ** max(job.attempts - 1, 0)),
        3600,
    )

    job.run_after = datetime.now(UTC) + timedelta(seconds=delay_seconds)

    job.locked_at = None
    job.last_error = str(error)[:2000]

    db.commit()
