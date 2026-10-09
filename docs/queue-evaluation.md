# Background queue: PostgreSQL now, and when to switch

Spec Phase 10 asks us to "evaluate Redis vs RabbitMQ vs cloud queue" once background processing
exists. This note records the evaluation and the decision.

## What we built

A job queue in PostgreSQL (the `jobs` table) behind a small `JobQueue` interface
(`backend/app/jobs/queue.py`):

- Workers claim jobs with `SELECT … FOR UPDATE SKIP LOCKED`, so several workers can run without
  taking the same job.
- A partial unique index on `dedupe_key` keeps one pending refresh per carrier.
- Failures retry with exponential backoff (1, 2, 4 minutes; 4 attempts), then stay FAILED with
  the error kept.
- A job locked longer than 30 minutes (a worker that died) is requeued.
- The worker queues refreshes of stale carriers every 15 minutes, at most 50 per round.
- Workers check in every 30 seconds, so the app can show whether one is running.

## Today's workload

- About a dozen carriers are loaded. A full refresh takes roughly 5 to 30 seconds per carrier;
  most of that time is waiting for data.transportation.gov and NHTSA.
- At most 50 jobs are queued per 15-minute round. That is a few jobs a minute, while PostgreSQL
  queues comfortably handle hundreds to thousands of jobs a second.
- The limit is the public sources (rate limits, response time), not the queue. Faster queuing
  would not refresh carriers any faster.

## Options

| | PostgreSQL (current) | Redis + RQ / Dramatiq / Celery | RabbitMQ | Cloud queue (SQS, Cloud Tasks, Service Bus) |
|---|---|---|---|---|
| New infrastructure | None: the database we already run (Supabase) | A Redis server to run, secure and back up | A broker to run; the most operations work | None to run, but ties us to one cloud |
| Job and data in one transaction | Yes: a job and the rows it changes commit together | No | No | No |
| Job status and history | A SQL query; the dashboard already shows it | Extra tooling; Redis results expire | Extra tooling | The provider's console; history is limited |
| Throughput | Hundreds to thousands of jobs a second | Tens of thousands a second | Tens of thousands a second | Very high, managed |
| Scheduling, retries | Built (schedule round, backoff) | Libraries provide them | Plugins or our own code | Built in (delays, retry policies, dead-letter queues) |
| Cost | Free | A managed Redis typically costs about $15 to $30 a month or more | Similar or more | Pay per request; cheap at this volume |

## Decision

**Stay on PostgreSQL.** This matches the spec ("Do NOT require Redis for the first MVP") and
the decision log (Redis deferred). It needs no new infrastructure, every job is visible with SQL
and on the dashboard, and the throughput is far beyond what the public sources allow.

## When to switch

Revisit when any of these is true:

1. **Volume:** sustained queues of more than about 10,000 waiting jobs, or a need for more than
   about 100 jobs a second. For example, bulk-loading every carrier in the FMCSA census
   (millions of carriers).
2. **Database load:** polling and locking on `jobs` shows up in Supabase's slow-query or
   connection metrics.
3. **Fan-out:** many independent consumers need the same events, for example notifications or
   webhooks on new signals. That calls for a broker (RabbitMQ) or pub/sub.
4. **Hosting:** the app moves to a cloud where a managed queue is the natural choice. Then that
   provider's queue (SQS, Cloud Tasks / Pub/Sub, Service Bus) is preferred over running Redis or
   RabbitMQ ourselves.

**What to pick then:**

- In general, **Redis + Dramatiq or RQ**: the smallest step for a Python app.
- If the app is hosted on a cloud, **that cloud's queue**.
- If fan-out (point 3) is the reason, **RabbitMQ**.

## How to switch

1. Write a new class with the four `JobQueue` methods (`enqueue`, `claim`, `complete`, `fail`).
2. Give it to `Worker(queue_factory=…)`.
3. Change the `JobStatusService` wiring in `api/v1/routes/jobs.py`.

The job handlers, the scheduler and the intelligence engine don't change. If job history must
stay queryable, keep writing a row to `jobs` as a log alongside the new queue.
