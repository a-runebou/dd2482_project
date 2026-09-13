from sqlalchemy.orm import Session

from app.infra.models.job import Job


def handle_job(
    db: Session,
    job: Job,
) -> None:
    raise ValueError(
        f"Unknown job kind: {job.kind}"
    )