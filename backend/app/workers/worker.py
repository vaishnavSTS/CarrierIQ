"""The background worker (spec Section 18): takes jobs from the queue and runs them.

    python -m app.workers.worker              # run until stopped (Ctrl+C)
    python -m app.workers.worker --once       # run every due job, then exit
    python -m app.workers.worker --schedule   # queue refreshes of stale carriers, then exit

For local development the API can run the worker too, in a background thread: set
RUN_WORKER_IN_API=true (see app/main.py). Hosted, it runs as its own service instead.

While running, the worker also queues refreshes of stale carriers every
`schedule_interval_minutes` (scheduled ingestion; turn off with SCHEDULER_ENABLED=false).

Each job runs in its own database session. A job that raises is retried with backoff by the
queue; a worker that dies mid-job has its job requeued after the lock timeout.
"""

import argparse
import logging
import os
import socket
import threading
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.jobs.handlers import HANDLERS, Handler
from app.jobs.queue import JobQueue, PostgresJobQueue
from app.jobs.scheduler import Schedule, schedule_iss_reference, schedule_stale_refreshes
from app.models.enums import JobStatus
from app.repositories.job_repository import JobRepository

logger = logging.getLogger(__name__)


class Worker:
    def __init__(
        self,
        session_factory: Callable[[], Session] = SessionLocal,
        queue_factory: Callable[[Session], JobQueue] = PostgresJobQueue,
        handlers: Mapping[str, Handler] = HANDLERS,
        name: str | None = None,
    ) -> None:
        self.session_factory = session_factory
        self.queue_factory = queue_factory
        self.handlers = handlers
        self.name = name or f"{socket.gethostname()}:{os.getpid()}"

    def run_once(self) -> bool:
        """Run the next due job; returns False when nothing was due."""
        with self.session_factory() as db:
            queue = self.queue_factory(db)
            job = queue.claim(self.name)
            if job is None:
                return False
            logger.info(
                "Job %d %s %s (attempt %d of %d)",
                job.id,
                job.job_type,
                job.payload,
                job.attempt,
                job.max_attempts,
            )
            handler = self.handlers.get(job.job_type)
            try:
                if handler is None:
                    raise ValueError(f"Unknown job type {job.job_type!r}")
                result = handler(db, job.payload)
            except Exception as exc:  # any failure is recorded on the job and retried
                db.rollback()
                status = queue.fail(job.id, f"{type(exc).__name__}: {exc}")
                log = logger.error if status == JobStatus.FAILED else logger.warning
                log("Job %d failed (%s): %s", job.id, status.value, exc)
            else:
                queue.complete(job.id, result)
                logger.info("Job %d done: %s", job.id, result)
            return True

    def poll_once(self) -> bool:
        """`run_once` for the long-running loop: a database error (e.g. the server dropping an
        idle connection) is logged and treated as "nothing ran", so the worker waits, gets a
        fresh connection and tries again instead of stopping."""
        try:
            return self.run_once()
        except Exception:
            logger.exception("Checking for jobs failed; retrying after the poll interval")
            return False

    def drain(self) -> int:
        """Run jobs until none is due; returns how many ran."""
        ran = 0
        while self.run_once():
            ran += 1
        return ran

    def schedule_round(self) -> list[int]:
        """Queue refreshes of stale carriers; returns the USDOT numbers queued."""
        with self.session_factory() as db:
            queue, now = self.queue_factory(db), datetime.now(UTC)
            schedule_iss_reference(db, queue, now)  # once a month: Estimated ISS tables
            return schedule_stale_refreshes(db, queue, now)

    def beat(self, started: datetime) -> None:
        """Check in, so the app can show that a worker is running."""
        try:
            with self.session_factory() as db:
                JobRepository(db).beat(self.name, started, datetime.now(UTC))
        except Exception:  # a missed check-in must not stop the worker
            logger.exception("Heartbeat failed")

    def run_forever(self, stop: threading.Event | None = None) -> None:
        """Run until stopped: Ctrl+C on the command line, or `stop` set when the API shuts down."""
        stop = stop or threading.Event()
        settings = get_settings()
        poll = settings.worker_poll_seconds
        schedule = Schedule() if settings.scheduler_enabled else None
        logger.info(
            "Worker %s started; polling every %.0fs; scheduled ingestion %s",
            self.name,
            poll,
            f"every {settings.schedule_interval_minutes:.0f} min" if schedule else "off",
        )
        started = datetime.now(UTC)
        next_beat = started
        while not stop.is_set():
            if datetime.now(UTC) >= next_beat:
                self.beat(started)
                next_beat = datetime.now(UTC) + timedelta(seconds=settings.worker_heartbeat_seconds)
            if schedule is not None and schedule.due():
                try:
                    self.schedule_round()
                except Exception:  # a failed round must not stop the worker
                    logger.exception("Scheduling round failed")
                schedule.ran()
            if not self.poll_once():
                stop.wait(poll)  # sleeps, but wakes at once when asked to stop
        logger.info("Worker %s stopped", self.name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--once", action="store_true", help="run due jobs, then exit")
    parser.add_argument(
        "--schedule", action="store_true", help="queue refreshes of stale carriers, then exit"
    )
    args = parser.parse_args()
    logging.basicConfig(level=get_settings().log_level)
    worker = Worker()
    if args.schedule:
        print(f"Queued refreshes for {worker.schedule_round()}")
        return
    if args.once:
        print(f"Ran {worker.drain()} job(s)")
        return
    try:
        worker.run_forever()
    except KeyboardInterrupt:
        logger.info("Worker %s stopped", worker.name)


if __name__ == "__main__":
    main()
