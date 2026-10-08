# CarrierIQ — Project Checkpoint

Running record of what has been built and what is left, phase by phase.
Phases come from `../PROJECT_SPECIFICATION.md` (Section 26). Update this file at the end of every work session.

**Last updated:** 2026-10-08
**Current phase:** Phase 3 (First Federal Data Integration) — Parts 1–3 done, Part 4 next

Legend: `[x]` done · `[ ]` to do · `[~]` in progress

---

## Progress at a glance

| Phase | Name | Status |
|---|---|---|
| 1 | Project Foundation | ✅ Done (2026-10-08) |
| 2 | Carrier Data Model | ✅ Done (2026-10-08) |
| 3 | First Federal Data Integration | 🔄 In progress (Parts 1–3 of 6 done) |
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

## Phase 3 — First Federal Data Integration 🔄

Goal: one source flows `Source → Raw storage → Normalization → PostgreSQL`.
First target: FMCSA/DOT carrier + inspection data (Company Census File as primary identity source).

Built part by part. Data flow: live API → `raw_records` → canonical tables → history, all in Supabase.
Only carriers that are searched get fetched (on-demand); tests use saved real responses, never the live API.

- [x] **Part 1 — Fetch from the live API.** `SocrataClient` (HTTP, errors → `SourceFetchError`),
  `CompanyCensusAdapter` (dataset `az4n-8mr2`, lookup by USDOT, only positive integers reach the
  API), every fetch recorded in `ingestion_runs` (RUNNING → SUCCEEDED / FAILED). 19 new tests;
  live read-only check passed (USDOT 295017 → UNITED MOVING AND STORAGE INC).
- [x] **Part 2 — Store as received.** Each fetched row is saved unchanged to `raw_records` with a
  SHA-256 fingerprint of its canonical JSON (key order doesn't matter). Unchanged payload → no new
  row, the fetch is just a recorded check in `ingestion_runs`. Changed payload → new row, old one
  kept. Code: `ingestion/fingerprint.py`, `repositories/raw_record_repository.py`,
  `CensusIngestionService.ingest()`. 7 new tests; live check (API → local DB): fetching USDOT
  295017 twice gave 1 raw record + 2 runs.
- [x] **Part 3 — Normalize** into `carriers`, `addresses`, `phones`, `officers`, `domains`,
  `authority`. Conversion is pure code in `ingestion/company_census_normalizer.py` (codes checked
  against the data dictionary + live API); saving is in `services/census_normalization_service.py`
  with `carrier_repository`, `observed_value_repository`, `authority_repository`. Changed values
  add new rows and mark old ones not current (nothing deleted); dockets update status in place.
  A record that can't be normalized fails the run but its raw record is kept. 37 new tests (82
  total); live check (API → local DB) with USDOT 295017 and 3025897 (DBA + 2 dockets).
  - Conversion rules: status A/I/P → ACTIVE/INACTIVE/PENDING (dockets also return P, not in the
    dictionary); safety S/C/U → SATISFACTORY/CONDITIONAL/UNSATISFACTORY; `YYYYMMDD` → date,
    invalid dates → empty; phones digits-only without US `1`, `0000000000` placeholders skipped;
    officers kept as full text (titles not guessed); unknown codes kept as received.
  - Fixed a Phase 2 test bug: DB tests were running against the real `public` tables instead of
    the throwaway `pytest_models` schema (always rolled back, so no damage). Now enforced.
- [ ] **Part 4 — History**: write `carrier_attribute_history` / `carrier_snapshots` for changed fields
- [ ] **Part 5 — Validate with real carriers** loaded into Supabase
- [ ] **Part 6 — Inspection data** adapter + normalization (separate dataset)

Open questions for later phases:
- Free email domains (e.g. `gmail.com`) are stored in `domains`; the shared-domain relationship
  rule (Phase 8) must ignore them or it will link unrelated carriers.
- `add_date` is used as `first_registered_date`, but the dictionary says it is also reset on
  reactivation/systematic updates, so it is "best available", not guaranteed first.

Source facts confirmed on the live API (2026-10-08): ~4.5M carriers, one row per USDOT number,
all values are text, empty fields are omitted from the row, non-numeric input is parsed as SoQL.

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
| 2026-10-08 | Phase 3 Part 1: live API client + Company Census adapter + ingestion run logging, 38 tests passing. |
| 2026-10-08 | Phase 3 Part 2: raw record storage with SHA-256 change detection, 45 tests passing. |
| 2026-10-08 | Phase 3 Part 3: census normalization into canonical tables; fixed test-schema isolation bug; 82 tests passing. |
