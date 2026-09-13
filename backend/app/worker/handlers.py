from uuid import UUID

from sqlalchemy.orm import Session

from app.infra.models.job import Job
from app.worker.calendar import handle_ics_poll


def handle_job(
    db: Session,
    job: Job,
) -> None:
    if job.kind == "ics_poll":
        source_id = job.payload.get(
            "source_id"
        )

        if not isinstance(source_id, str):
            raise ValueError(
                "ics_poll job missing source_id"
            )

        handle_ics_poll(
            db,
            source_id=UUID(source_id),
        )

        return

    raise ValueError(
        f"Unknown job kind: {job.kind}"
    )