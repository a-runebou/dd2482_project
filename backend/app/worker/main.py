import time

from app.infra.db import SessionLocal
from app.worker.handlers import handle_job
from app.worker.health import record_heartbeat
from app.worker.jobs import (
    claim_job,
    complete_job,
    retry_job,
)

POLL_SECONDS = 1


def run_worker() -> None:
    while True:
        with SessionLocal() as db:
            job = claim_job(db)

            # Check if worker is alive
            record_heartbeat()

            if job is None:
                time.sleep(POLL_SECONDS)
                continue

            # Process the job
            try:
                handle_job(db, job)
            except Exception as exc:  # noqa: BLE001
                retry_job(db, job, exc)
            else:
                complete_job(db, job)

if __name__ == "__main__":
    run_worker()
