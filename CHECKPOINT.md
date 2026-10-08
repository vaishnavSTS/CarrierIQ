# CarrierIQ — Project Checkpoint

Running record of what has been built and what is left, phase by phase.
Phases come from `../PROJECT_SPECIFICATION.md` (Section 26). Update this file at the end of every work session.

**Last updated:** 2026-10-08
**Current phase:** Phase 4 (Carrier Search) — Parts 1–2 done, Part 3 next

Legend: `[x]` done · `[ ]` to do · `[~]` in progress

---

## Progress at a glance

| Phase | Name | Status |
|---|---|---|
| 1 | Project Foundation | ✅ Done (2026-10-08) |
| 2 | Carrier Data Model | ✅ Done (2026-10-08) |
| 3 | First Federal Data Integration | ✅ Done (2026-10-08) |
| 4 | Carrier Search | 🔄 In progress (Parts 1–2 of 4 done) |
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

## Phase 3 — First Federal Data Integration ✅

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
- [x] **Part 4 — History.** 11 tracked carrier attributes (name, DBA, entity type, status, email,
  fleet size, drivers, safety rating + date, registration date, MCS-150 date) go to
  `carrier_attribute_history`: a change closes the open row (`valid_to` = today) and opens a new
  one; a value that disappears is recorded as empty. `carrier_snapshots` gets one row per new raw
  record (its payload hash); unchanged fetches add nothing. `valid_from` is the day we observed
  the value (the census file has no change dates of its own). Code:
  `repositories/carrier_history_repository.py`, `CensusNormalizationService.apply()`; ingest
  results report `changed_attributes`. 7 new tests (89 total); live check (API → empty local DB):
  USDOT 3025897 opened 9 history rows + 1 snapshot, second fetch added nothing.
- [x] **Part 5 — Validate with real carriers in Supabase.** First real data in Supabase: 10
  carriers picked from the live API to cover edge cases — 2972170 (DBA + 3 dockets incl. FF),
  295014 (inactive), 872417 (pending, Mexico), 297569 (undeliverable physical + mailing),
  782429 (undeliverable mailing), 295037 (conditional rating), 295023 (unsatisfactory rating),
  3695639 (cell phone), 603897 (broker), 297080 (2,446 power units). An independent script
  re-fetched each record with plain HTTP and checked Supabase field by field with its own logic:
  **260/260 checks passed** (raw payload, carrier fields, addresses, undeliverable flags, phones,
  officers, domains, dockets, open history, snapshot, run status).
  - Found + fixed: ~28,000 census phone values are junk (`0`, `1`, `01012022` — a date). Phones
    now need ≥10 digits; junk stays only in `raw_records`. 3695639's junk cell row is marked
    not current (rows are never deleted).
  - Supabase now holds: 10 carriers, 10 raw records, 11 ingestion runs, 20 addresses, 16 phones
    (15 current), 8 officers, 5 domains, 8 dockets, 89 history rows, 10 snapshots.
  - SoQL note: numeric-looking census fields (e.g. `power_units`) are text in the API; numeric
    filters need a cast (`power_units::number > 1000`).
- [x] **Part 6 — Inspection data.** Two linked datasets: Vehicle Inspection File `fx4q-ay7w`
  (headers by USDOT, ~3-year rolling window, 8.3M rows) and Inspections Per Unit `wt8s-2hbx`
  (vehicles/VINs by inspection_id, 13.9M rows). Each header and unit row is stored in
  `raw_records`; `inspections` gets date, level, state, location, vehicle/driver OOS flags,
  violation totals (JSONB) and the VIN of unit 1 (validated: 17 chars, no I/O/Q). Trailer VINs
  stay in raw records for Phase 7. Carrier must be loaded first (census → inspections). Only new
  or changed rows are stored/rewritten; inspections are never deleted. Code:
  `ingestion/vehicle_inspections.py`, `ingestion/vehicle_inspection_normalizer.py`,
  `repositories/inspection_repository.py`, `services/inspection_ingestion_service.py`.
  - Client now follows spec 19.1: paging (`$limit`/`$offset`), retries with exponential backoff
    on network errors / 429 / 5xx, dataset IDs in configuration. Raw rows inserted in batches.
  - 27 new tests (119 total). Live: USDOT 297080 → 1,109 inspections + 1,437 units in 3.9s
    (local) / 7.3s (Supabase); re-fetch writes nothing.
  - Supabase validation: inspections for the 10 Part 5 carriers (8 have none in the window,
    297569 has 30, 297080 has 1,109) checked against a fresh live fetch with independent logic:
    **9,124/9,124 checks passed**.
  - Not yet: individual violations (`876r-jsdb`, Phase 5); the per-carrier orchestration
    "census → inspections when stale" (Phase 4 search).

Open questions for later phases:
- Free email domains (e.g. `gmail.com`) are stored in `domains`; the shared-domain relationship
  rule (Phase 8) must ignore them or it will link unrelated carriers.
- `add_date` is used as `first_registered_date`, but the dictionary says it is also reset on
  reactivation/systematic updates, so it is "best available", not guaranteed first.

Source facts confirmed on the live API (2026-10-08): ~4.5M carriers, one row per USDOT number,
all values are text, empty fields are omitted from the row, non-numeric input is parsed as SoQL.

---

## Phase 4 — Carrier Search 🔄

Built part by part: (1) search API → (2) carrier profile API → (3) search screen → (4) profile page.

- [x] **Part 1 — Search API** `GET /api/v1/carriers/search?q=…`. One box, type detected
  (`services/carrier_search_query.py`): digits / "USDOT 123" → USDOT; `MC|MX|FF` + digits →
  docket; else name (≥3 chars). Input is cleaned so nothing unsafe reaches SoQL.
  - USDOT: on-demand refresh (`services/carrier_refresh_service.py`): load if missing or older
    than `CARRIER_REFRESH_HOURS` (24) — census then inspections — then serve from the database.
    If the source fails and stored data exists, it is served with `stale: true`.
  - Docket: live census lookup across docket1–3 (one docket can belong to several USDOTs — e.g.
    MC1000511 → 2972170 and 3212670); each carrier is loaded on demand.
  - Name: loaded carriers first (trigram ranking), then live census matches — names starting
    with the text first, then names containing it. Live-only results are not saved
    (`loaded: false`); opening one loads it.
  - Results: name, DBA, USDOT, dockets, authority status, registration status, fleet, city/state,
    last refreshed; insurance status (Phase 6) and review status (Phase 8) are null for now.
  - 37 new tests (156 total). Live check (API → local DB): USDOT 0.0–0.1s when fresh, MC 0.7s,
    name 0.6s.
- [x] **Part 2 — Carrier profile API** `GET /api/v1/carriers/{usdot}` (refreshes on demand
  first, 404 if the carrier exists nowhere). Sections per spec 6: identity (names, status,
  contacts, current addresses/phones with first-seen dates, officers, domains); authority (status
  + every docket); insurance (`available: false` until Phase 6); safety (inspection count,
  vehicle/driver OOS counts and rates, per-year counts, 10 most recent inspections, safety
  rating; crash count null until crashes are loaded); equipment (power units, distinct VINs
  seen in inspections with counts and first/last dates); recent changes (before → after from
  history; the first load is not a change). Code: `services/carrier_profile_service.py`,
  `schemas/carrier_profile.py`, new queries in `inspection_repository` / history repo.
  - Bug found by the live check and fixed: freshness used only the census refresh time, so a
    carrier whose inspections were never fetched (or whose inspection fetch failed) counted as
    fresh for 24h. Census and inspections are now refreshed separately; inspection age comes
    from the last successful inspection run in `ingestion_runs`.
  - 11 new tests (167 total). Live: 297080 profile (1,109 inspections, 647 VINs) in 0.1s from
    the database; 3025897 picked up its 3 missing inspections on the next request.
- [ ] **Part 3 — Search screen** (dashboard search box + results table)
- [ ] **Part 4 — Carrier profile page**

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
| 2026-10-08 | Phase 3 Part 4: carrier attribute history + snapshots, 89 tests passing. |
| 2026-10-08 | Phase 3 Part 5: 10 real carriers loaded into Supabase, 260/260 independent checks passed; junk phone values now skipped; 92 tests passing. |
| 2026-10-08 | Phase 3 Part 6: inspections + vehicle units ingestion, client paging/retries/config IDs; 1,139 inspections in Supabase validated 9,124/9,124; 119 tests passing. Phase 3 complete. |
| 2026-10-08 | Phase 4 Part 1: carrier search API (USDOT / docket / name) with on-demand refresh; 156 tests passing. |
| 2026-10-08 | Phase 4 Part 2: carrier profile API; fixed refresh so census and inspections age separately; 167 tests passing. |
