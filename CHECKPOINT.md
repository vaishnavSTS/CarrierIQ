# CarrierIQ — Project Checkpoint

Running record of what has been built and what is left, phase by phase.
Phases come from `../PROJECT_SPECIFICATION.md` (Section 26). Update this file at the end of every work session.

**Last updated:** 2026-10-08
**Current phase:** Phase 2 complete → Phase 3 (First Federal Data Integration) is next

Legend: `[x]` done · `[ ]` to do · `[~]` in progress

---

## Progress at a glance

| Phase | Name | Status |
|---|---|---|
| 1 | Project Foundation | ✅ Done (2026-10-08) |
| 2 | Carrier Data Model | ✅ Done (2026-10-08) |
| 3 | First Federal Data Integration | ⏭️ Next |
| 4 | Carrier Search | Not started |
| 5 | Safety | Not started |
| 6 | Authority & Insurance | Not started |
| 7 | Equipment / VIN | Not started |
| 8 | Intelligence Engine | Not started |
| 9 | Intelligence UI | Not started |
| 10 | Background Processing | Not started |

---

## Phase 1 — Project Foundation ✅

Goal: `React → FastAPI → PostgreSQL` works locally.

- [x] Repository structure (`backend/`, `frontend/`, `docker-compose.yml`, `README.md`)
- [x] React app — React 19, TypeScript, Vite, Tailwind 4, TanStack Query, React Router
- [x] Frontend shell — app layout, dashboard page, 404 page, system status card
- [x] FastAPI app — config, logging with request IDs, error handling
- [x] Layered backend — route → service → repository
- [x] Database connection — SQLAlchemy 2.0 + psycopg 3
- [x] Alembic migrations — initial migration `0001` (enables `pg_trgm` for name search)
- [x] Health check — `GET /api/v1/health` reports API + database status
- [x] Tests — 3 health endpoint tests passing; ruff + mypy configured
- [x] Docker — backend + frontend containers, migrations run on startup
- [x] PostgreSQL — **Supabase** (session pooler), migration `0001` applied
- [x] End-to-end verified — dashboard shows API OK + Database OK

### Setup decisions made in Phase 1
- **Database is Supabase**, not a local Postgres container. Use the **Session pooler** connection
  string (port 5432) with `?sslmode=require`. The Direct connection is IPv6-only and fails from
  Docker on Windows; the Transaction pooler (6543) conflicts with psycopg 3 prepared statements.
- `DATABASE_URL` lives in `.env` (for Docker) and `backend/.env` (for local venv runs). Both are
  git-ignored. Special characters in the password must be percent-encoded (`$` → `%24`).
- The local Postgres container is still available with `docker compose --profile localdb up`.
- Fixed: `alembic/env.py` now escapes `%` in the database URL (encoded passwords broke migrations).

### Open housekeeping
- [x] Initialize git and make the first commit (remote: github.com/vaishnavSTS/CarrierIQ)
- [ ] Reset the Supabase database password (it was shared in chat) and update both `.env` files

---

## Phase 2 — Carrier Data Model ✅

Goal: all core tables exist as ORM models with migrations and tests (spec Section 11).

- [x] Raw layer: `raw_records`
- [x] Canonical: `carriers` (trigram indexes on legal/DBA name for fuzzy search)
- [x] Canonical: `addresses`, `phones`, `officers`, `domains`
- [x] Canonical: `authority` (one row per docket; docket numbers kept as text)
- [x] Canonical: `insurance`
- [x] Canonical: `inspections`
- [x] Canonical: `crashes`
- [x] Canonical: `vehicles`
- [x] History: `carrier_attribute_history`, `carrier_snapshots`, `identity_events`
- [x] Derived: `intelligence_signals`, `signal_evidence`
- [x] Derived: `timeline_events`, `relationships`
- [x] Operational: `ingestion_runs`
- [x] Alembic migration `0002` — tested up/down/up locally, applied to Supabase, `alembic check` clean
- [x] Model tests — 16 new (6 schema-rule tests + 10 database tests); 19 total passing

### Rules the database enforces
- USDOT number is unique; authority docket is unique per carrier; inspection/crash IDs unique per source.
- Only one current (`valid_to IS NULL`) history value per carrier attribute; `valid_to >= valid_from`.
- `confidence`, `severity`, status and type columns accept only their fixed values (CHECK constraints).
- Every canonical/history row has a non-null `source` + `raw_record_id` (source traceability).
- Deleting a signal deletes its evidence; corrections to identity events never delete the original.

### Not enforced by the database (by design)
- "Every signal has at least one evidence row" — enforced in the signal service (Phase 8), per spec 13.2.
- Database tests need `TEST_DATABASE_URL` (see README); without it they are skipped.

---

## Phase 3 — First Federal Data Integration

Goal: one source flows `Source → Raw storage → Normalization → PostgreSQL`.
First target: FMCSA/DOT carrier + inspection data (Company Census File as primary identity source).

- [ ] Source adapter for the Company Census File (data.transportation.gov / Socrata)
- [ ] Store untouched source rows in `raw_records`
- [ ] Normalize into canonical tables (`carriers`, addresses, phones, …)
- [ ] Inspection data adapter + normalization
- [ ] Record each run in `ingestion_runs`
- [ ] On-demand ingestion (per spec decision)
- [ ] Validate loaded data before moving on

---

## Phase 4 — Carrier Search

- [ ] USDOT search
- [ ] MC search
- [ ] Name search (fuzzy, `pg_trgm`)
- [ ] Search API endpoint(s)
- [ ] Enable the dashboard search box
- [ ] Carrier profile page (overview)

---

## Phase 5 — Safety

- [ ] Inspection history
- [ ] Vehicle OOS
- [ ] Driver OOS
- [ ] Inspection counts
- [ ] Basic trends
- [ ] Charts / tables in the UI

---

## Phase 6 — Authority & Insurance

- [ ] Current authority
- [ ] Authority history
- [ ] Insurance
- [ ] Insurance history
- [ ] Change detection

---

## Phase 7 — Equipment / VIN

- [ ] VIN extraction
- [ ] VIN-to-carrier relationships
- [ ] VIN history
- [ ] NHTSA vPIC decoding

---

## Phase 8 — Intelligence Engine

Deterministic signals; every signal must have evidence.

- [ ] Authority change
- [ ] Insurance change
- [ ] Shared VIN
- [ ] Identity change
- [ ] Fleet consistency
- [ ] Safety trend
- [ ] Federal event timeline

---

## Phase 9 — Intelligence UI

- [ ] Intelligence summary
- [ ] Signal cards
- [ ] Evidence drawer
- [ ] Timeline
- [ ] Relationship view

---

## Phase 10 — Background Processing

- [ ] Worker
- [ ] Scheduled ingestion
- [ ] Retry handling
- [ ] Job status
- [ ] Optional queue (evaluate Redis vs RabbitMQ vs cloud queue)

---

## MVP done when a user can (spec Section 33)

- [ ] 1. Open the application
- [ ] 2. Search for a carrier
- [ ] 3. View normalized carrier information
- [ ] 4. View authority and insurance
- [ ] 5. View safety/inspection history
- [ ] 6. View equipment/VIN information
- [ ] 7. View historical changes
- [ ] 8. See intelligence signals
- [ ] 9. Open a signal
- [ ] 10. See the evidence behind it

> The user must be able to understand why the system generated a signal.

---

## Session log

| Date | What was done |
|---|---|
| 2026-10-08 | Phase 1 built (backend, frontend, Docker, Alembic, health check, tests). Switched database to Supabase session pooler, fixed `%` escaping in `alembic/env.py`, applied migration `0001`, verified dashboard end-to-end (API OK, Database OK). |
| 2026-10-08 | Git initialized and connected to GitHub. Phase 2 built: 19 models, migration `0002` applied to Supabase, 16 new model tests. |
