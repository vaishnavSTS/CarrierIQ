# CarrierIQ — Project Checkpoint

Running record of what has been built and what is left, phase by phase.
Phases come from `../PROJECT_SPECIFICATION.md` (Section 26). Update this file at the end of every work session.

**Last updated:** 2026-10-08
**Current phase:** All 10 phases done — the MVP checklist below is met

Legend: `[x]` done · `[ ]` to do · `[~]` in progress

---

## Progress at a glance

| Phase | Name | Status |
|---|---|---|
| 1 | Project Foundation | ✅ Done (2026-10-08) |
| 2 | Carrier Data Model | ✅ Done (2026-10-08) |
| 3 | First Federal Data Integration | ✅ Done (2026-10-08) |
| 4 | Carrier Search | ✅ Done (2026-10-08) |
| 5 | Safety | ✅ Done (2026-10-08) |
| 6 | Authority & Insurance | ✅ Done (2026-10-08) |
| 7 | Equipment / VIN | ✅ Done (2026-10-08) |
| 8 | Intelligence Engine | ✅ Done (2026-10-08) |
| 9 | Intelligence UI | ✅ Done (2026-10-09) |
| 10 | Background Processing | ✅ Done (2026-10-09) |

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

## Phase 4 — Carrier Search ✅

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
- [x] **Part 3 — Search screen.** Dashboard search box is live (with examples); submitting
  goes to `/search?q=…` (bookmarkable, back button works; "Search" added to the top nav).
  Results table per spec 21: carrier + DBA, USDOT, MC/docket (inactive dockets marked),
  authority and registration badges, insurance ("Not available" until Phase 6), fleet,
  location, review status ("Not reviewed" until Phase 8), last updated ("Not loaded yet" for
  live-only results, "stale" badge when the source failed). Loading message explains that a new
  carrier is fetched from FMCSA first; validation errors show the API's message. Rows link to
  `/carriers/{usdot}` (page arrives in Part 4). Shared `StatusBadge` now also used by the system
  status card. Code: `features/carrier-search/`, `pages/SearchPage.tsx`, `api/carriers.ts`,
  `hooks/useCarrierSearch.ts`, `types/carrier.ts`, `utils/format.ts`, `utils/status.ts`.
  - Checked in Chrome against the live API (local DB): docket MC1000511 → 2 carriers, name
    "united moving" → 20 results, "ab" → validation message; no console errors. ESLint + build
    clean. (No frontend unit-test framework is set up yet.)
- [x] **Part 4 — Carrier profile page** `/carriers/{usdot}`. Header: name, DBA, USDOT, dockets,
  authority / registration badges, insurance and review status placeholders, last refresh (+ stale
  warning). Section links, then: Identity (entity type decoded from CARSHIP, drivers, dates,
  email, officers, formatted phones, address cards with undeliverable badge and first-seen date);
  Authority & Insurance (docket table; insurance "not loaded yet"); Safety (tiles: inspections,
  vehicle/driver OOS %, crashes, safety rating; per-year table with OOS %; 10 recent inspections
  with OOS flags); Equipment (power units, vehicles observed, 25 most recent VINs); Intelligence
  (placeholder until Phase 8); Timeline (before → after changes). Loading, not-found and invalid
  USDOT states. Code: `pages/CarrierProfilePage.tsx`, `features/carrier-profile/`,
  `hooks/useCarrierProfile.ts`, `types/carrierProfile.ts`. Tables only — trend charts are Phase 5.
  - Checked in Chrome (live API → local DB): 297080 full profile; clicking a "Not loaded yet"
    name result (3320626) loaded it from FMCSA in ~4s; 99999999 → not found; "abc" → invalid.
    No console errors; ESLint + build clean.

  - Changed on request: profile sections are **tabs** (one section shown at a time, Identity by
    default) instead of one long page. The open tab is kept in the URL (`?tab=safety`) so a
    refresh or shared link keeps it; switching tabs doesn't add browser-history entries.

Phase 4 done: a user can search by USDOT / MC / name and open a carrier profile; carriers are
fetched from FMCSA on demand and refreshed after 24h.

---

## Phase 5 — Safety ✅

Built part by part: (1) violations → (2) safety API (trends, history, violation breakdown) →
(3) Safety tab with charts.

- [x] **Part 1 — Violations.** Third inspection dataset, Vehicle Inspections and Violations
  `876r-jsdb` (13.6M rows), fetched in batches by inspection_id as its own ingestion run; every
  row stored in `raw_records`. Each inspection's `violation_data` now holds the header counts plus
  `violations`: code, description, 49 CFR part + title, applies to DRIVER/VEHICLE, unit number,
  out-of-service, category id, citation number — in the source's sequence order.
  - Grouping: the dataset's `insp_violation_category_id` has no published names, so violations
    are grouped by 49 CFR part (393 Parts & accessories, 392 Driving, 395 Hours of service, 396
    Inspection/repair, 100–180 Hazmat, …); the raw category id is kept.
  - If any of the three fetches fails, nothing is stored and every run started is marked failed.
  - Bug found by the live check and fixed: only inspections whose source rows changed were
    rewritten, so the 587 (of 1,109) inspections without violations kept the old format.
    Inspections are now re-normalized on every fetch and written only when the result differs —
    normalizer changes reach stored data automatically.
  - Source data quality (297080): 4 of 1,109 headers count a violation with no violation row;
    2 vehicle-OOS flags have no OOS vehicle violation. Header counts/flags stay authoritative.
  - 11 new tests (178 total). Live: 297080 → 1,039 violations, re-fetch writes nothing.
    **Supabase validation: 1,139/1,139 inspections' violations match a fresh live fetch.**
- [x] **Part 2 — Safety API.**
  - `GET /api/v1/carriers/{usdot}/safety`: quarterly trend from the first inspection's quarter
    to the current quarter, empty quarters filled with zeros (inspections, vehicle/driver OOS
    counts + rates, violations); counts by inspection level and by state; violation summary
    (rows vs header total, driver/vehicle, OOS, by 49 CFR part, top 10 codes with last seen).
  - `GET /api/v1/carriers/{usdot}/inspections?page=&page_size=(≤100)&oos_only=`: full history,
    newest first, each inspection with its violations.
  - Both refresh the carrier on demand first; 404 for unknown carriers. Calculations are pure
    functions in `services/safety_analysis.py`; `services/carrier_safety_service.py`,
    `schemas/carrier_safety.py`, `InspectionRepository.page()`.
  - 12 new tests (190 total). Live on Supabase (297080): /safety 1.9s (loads all 1,109
    inspections — optimize later if needed), /inspections 0.5s; 98 OOS inspections.
- [x] **Part 3 — Safety tab.** Headline tiles, then:
  - **Trends**: inspections per quarter (column chart) and vehicle vs driver OOS rate per quarter
    (line chart, one % axis, legend, crosshair tooltip with sample size). The in-progress quarter
    is marked `*` and its rate is a separate dot, not joined to the trend (2 inspections at 0%
    would otherwise read as a sharp improvement). Empty quarters show no rate. Every chart has a
    "Show as table" view.
  - **Violations**: totals (vehicle/driver/OOS, plus the header-vs-detail gap), horizontal bars
    by 49 CFR part with OOS counts, top-10 violation table with last-seen date.
  - **Inspection history**: paged (25), newest first, "out-of-service only" filter, each row
    expands to its violations (driver / unit, description, code, citation, OOS).
  - Charts are plain SVG (no chart library) in `components/charts/` following the data-viz
    guidance; series colours (blue, orange) validated for colour-blind separation and contrast.
    Code: `features/carrier-profile/safety/`, `hooks/useCarrierSafety.ts`, `types/carrierSafety.ts`.
  - Checked in Chrome on Supabase data (297080): charts, tooltips, OOS filter (98), expanded
    violations; no console errors. ESLint + build clean.

Phase 5 done: inspection history, vehicle/driver OOS, counts, quarterly trends and violation
detail, with charts and tables.

---

## Phase 6 — Authority & Insurance ✅

Built part by part: (1) authority → (2) insurance → (3) change detection → (4) Authority &
Insurance tab (with its API).

**Sources (found 2026-10-08).** FMCSA moved licensing & insurance to **Motus** in May 2026. The
legacy **L&I** datasets (Carrier `6eyk-hxee`, AuthHist `9mw4-x3tu`, Insur `ypjt-5ydn`, InsHist
`6sqe-dvqs`) say "last refreshed on 05/14/2026 and will no longer be updated" — frozen history.
Motus (Carrier AWH `inys-ebih`, AuthHist AWH `yu5v-wbh6`, Insur AWH `c5y8-a4uz`, InsHist AWH
`3uet-3z4i`) is current and daily but **does not hold every carrier yet** (e.g. 297569, 3320626
are only in legacy). Data dictionaries saved in the repo root (outside git):
`USDOT_Motus_Operating_Authority_Data_Dictionary.pdf`, `FMCSA_Operating_Authority_Data_Dictionary_V2.pdf`.
Dictionary errors found by comparing the same policy in both systems: Motus amounts are in
**dollars** (dictionary says thousands); legacy amounts are in thousands. Formats differ: legacy
USDOT zero-padded to 8, dates MM/DD/YYYY, dockets may be zero-padded (`FF004758`); Motus dates
YYYYMMDD, form codes `BMC-91X` vs legacy `91X`.

- [x] **Part 1 — Operating authority.** Four fetches per carrier (legacy Carrier + AuthHist,
  Motus Carrier + AuthHist), each its own run, all-or-nothing, raw rows stored. `authority`
  gains authority type, BI&PD required / on file (dollars), cargo/bond required / on file,
  revocation pending, and `status_source` (CENSUS | MOTUS | LEGACY_LI) + `status_as_of`.
  Precedence (corrected in Part 3 — see below): Motus > legacy (frozen) > census docket status; dockets only known to FMCSA authority data are added. New `authority_history` table
  (migration `0003`): dated actions from both systems (legacy rows give an original action and
  a disposition, e.g. MC139446 GRANTED 1986 → REVOKED 2021-06-08 → REINSTATED 2021-06-15).
  Migration `0004` labels pre-existing census statuses. Authority joins the on-demand refresh
  (refresh now takes a list of detail sources). Shared `services/dataset_batch.py` (multi-dataset
  fetch/store) now also used by inspections.
  - 25 new tests (215 total). Supabase migrated to `0004`; authority loaded for all 11 carriers;
    independent live check **38/38** (Motus status/coverage, legacy amounts ×1000, census status
    kept, full history per docket).
- [x] **Part 2 — Insurance filings.** Four fetches per carrier (Motus Insur + InsHist by USDOT,
  legacy InsHist by padded USDOT, legacy Insur by the carrier's dockets padded to 6 digits —
  legacy current filings carry no USDOT). `insurance` (migration `0005`) gains docket, type
  (BIPD / CARGO / BOND / TRUST_FUND from type or form code), class (P/E/1/2), form code (without
  "BMC-"), coverage + underlying limit in dollars, termination date, status (ON_FILE |
  CANCELLED | REPLACED | NAME_CHANGED | TRANSFERRED | NO_LONGER_ON_FILE), `on_file`,
  received date, source system, as-of date. Current filings come from Motus when Motus holds
  the docket, else legacy (as of 2026-05-14); past filings from both, de-duplicated by docket +
  type + policy + effective + cancellation date. Nothing deleted: a filing that leaves the
  current list is kept as NO_LONGER_ON_FILE. Insurance joins the refresh after authority.
  Shared value parsing moved to `ingestion/fmcsa_values.py`.
  - Legacy non-BI&PD filings carry 0 amounts (shown as unknown); Motus gives a cargo amount.
  - One policy number can cover two filings (e.g. MCP2603258C: cargo form 34 and BI&PD 91X).
  - 14 new tests (229 total). Supabase migrated to `0005`; insurance loaded for all 11 carriers;
    independent live check: current filings (Motus and legacy) and past filings match for
    **11/11** carriers (first validator run was wrong — it merged the two filings above).
- [x] **Part 3 — Change detection → federal timeline (spec 12.7).** Pure rules in
  `services/change_detection.py` turn stored records into `timeline_events`, each traced to its
  raw record, with a stable `event_key` (migration `0006`) so rebuilds update instead of
  duplicating. Rebuilt after every successful carrier refresh (`TimelineService`).
  - Authority: granted / reinstated (INFO), revocation started (MEDIUM) / discontinued (INFO),
    revoked / suspended / out of service (HIGH), inactivated (MEDIUM), withdrawn / application
    not granted / expired (LOW); the same action in both systems → one event. Filer e-mails in
    Motus reasons ("Withdrawn by x@y.com") are never shown.
  - Insurance (per docket + type): insurer changed (INFO — not a concern on its own, spec 12.2),
    BI&PD coverage up (INFO) / down (LOW), policy cancelled (INFO if replaced next day, else
    MEDIUM), gap in filings (BI&PD MEDIUM, others LOW), active authority with no BI&PD on file
    (MEDIUM). Renewals with the same insurer (any spelling) are not changes.
  - Live on Supabase: e.g. SURRATT — BI&PD cancelled 2024-11-07, nothing on file from 11-08,
    authority revoked 2024-11-13. A crash (two filings starting the same day) was found and fixed.
  - **Correction to Part 1:** the census docket status is NOT the operating-authority status —
    it shows "A" for revoked authority (MC161790, MC196779, MC199622). Part 1 ranked it above
    legacy, so revoked carriers showed "ACTIVE". Now Motus > legacy > census; a census refresh
    never overwrites a Motus or legacy status. Supabase reloaded: 9/9 dockets match.
  - 14 new tests (243 total).
- [x] **Part 4 — Authority & Insurance tab + API.**
  - `GET /api/v1/carriers/{usdot}/authority`: dockets (type, status + source + as-of, BI&PD
    required / on file, cargo/bond required / on file, revocation pending), insurance on file,
    insurance history (newest first), authority history (each action once; filer e-mails hidden).
  - Headline insurance status (`services/insurance_status.py`): ON_FILE when every docket with
    active operating authority (Motus or legacy — never a census docket status) has BI&PD on file
    (brokers: bond / trust fund also count); NOT_ON_FILE otherwise; none without active
    authority. Shown in the profile header (with source + as-of) and in search results.
  - Profile now returns the timeline events; the Timeline tab merges them with recorded field
    changes, with severity badges and a "medium and high only" filter.
  - Frontend: docket cards, insurance on file / history tables (show 10, "show all"), authority
    history. Missing cargo/bond is red only while the authority is active.
  - Fix found by tests: a census "A" made the insurance status claim NOT_ON_FILE; the "no BI&PD
    while active" timeline rule had the same flaw. Both now require a real authority status.
  - 9 new backend tests (252 total). Checked in Chrome on Supabase data (SURRATT revoked,
    UNITED MOVING on file); no console errors; ESLint + build clean.

Phase 6 done: current authority and history, current insurance and history, and change
detection (authority + insurance events on the timeline), from Motus and legacy L&I.

---

## Phase 7 — Equipment / VIN ✅

Built part by part: (1) VIN links for the carrier's own vehicles → (2) shared VINs across all
FMCSA inspections (live) → (3) NHTSA vPIC decoding → (4) Equipment tab.
Checked 2026-10-08: vPIC `DecodeVINValuesBatch` decodes up to 50 VINs per call (~0.4s for 5)
and returns a check-digit verdict; the units dataset answers VIN lookups in ~0.5s.

- [x] **Part 1 — VIN extraction and VIN → carrier links.** Every unit on a carrier's
  inspections (power units and trailers, from the stored unit raw records) becomes a `vehicles`
  row and a `relationships` row `VIN_OBSERVED_WITH` (vehicle → **USDOT number**, so VINs can be
  linked to carriers that aren't loaded) with first / last seen, number of inspections, and
  confidence (2+ inspections HIGH, 1 MEDIUM — spec 13.1). Runs after every refresh, before the
  timeline (refresh now takes a list of after-refresh steps). Code:
  `services/vehicle_observation_service.py`, `repositories/vehicle_repository.py`,
  `repositories/relationship_repository.py`.
  - Supabase: 930 VINs linked (297080: 893 incl. trailers; 297569: 32; 295017: 5).
  - Performance fix: per-link round trips took 69s for 297080; batched to **1.0s**.
  - 3 new tests (255 total).
- [x] **Fix (reported from the app): empty Authority & Insurance tab for private carriers.**
  BLUETRITON (297080) has no data in any of the 7 FMCSA authority/insurance datasets because the
  census classifies it "PRIVATE PROPERTY" (hauls its own goods) — no for-hire authority, so no
  FMCSA filings. Carriers now store the census classification (`operation_classification`,
  CLASSDEF, migration `0007`, tracked in history); the tab explains why there's no data, the
  header says "Not filed with FMCSA (not a for-hire carrier)", Identity shows "Operation".
  1.47M census carriers are PRIVATE PROPERTY only. Supabase migrated and backfilled from stored
  census records. 1 new test (256 total).
- [x] **Part 2 — Shared VINs (spec 12.3).** The carrier's VINs are looked up in the whole
  Inspections Per Unit dataset (batches of 100); inspections that aren't the carrier's are
  fetched to learn their USDOT and date; each (VIN, other USDOT) becomes a VIN_OBSERVED_WITH link
  with dates, inspection count and confidence (2+ HIGH, 1 MEDIUM), traced to the unit raw record.
  Unit rows and headers are stored raw. A refresh detail source (after inspections, own 24h
  freshness); an inspection whose USDOT is the carrier's own is never "another carrier".
  Code: `services/shared_vin_service.py`, `VehicleInspectionAdapter.fetch_units_by_vins/
  fetch_headers` (VINs validated before reaching SoQL).
  - Supabase: 297080 BLUETRITON — 147 of 893 VINs on 266 inspections of 92 other carriers
    (top: DS SERVICES OF AMERICA 49 VINs; PENSKE TRUCK LEASING 17). 295017 and 297569: none.
    A relationship to review, not a verdict (leasing, related companies, sold equipment).
  - Performance: per-carrier saves took 26.1s; batched across carriers → 6.8s.
  - 4 new tests (260 total).
- [x] **Part 3 — NHTSA vPIC decoding (spec 8.4).** `ingestion/vpic.py` posts to
  DecodeVINValuesBatch (50 VINs per call, 4 calls in parallel, retries shared with the Socrata
  client via `ingestion/http_retry.py`); `ingestion/vpic_normalizer.py` keeps make, model, year,
  body class, vehicle type, GVWR class, manufacturer, error code + text, and `check_digit_valid`
  (False when vPIC reports error 1). `vehicles` gains those columns + `decode_raw_record_id`
  (migration `0008`); each vPIC result is stored raw (`nhtsa_vpic`). Only undecoded VINs are sent
  — a decode is kept forever; a vPIC outage is logged and retried next refresh, never fails it.
  Runs after VIN links in the refresh. Decoding enriches; it is never a risk judgement.
  - Supabase: all 930 VINs decoded (e.g. 297569: 16 Great Dane trailers, 13 Mack trucks;
    297080: 7 VINs with an invalid check digit — likely mistyped on the inspection report).
  - Performance: sequential batches took 42.0s for 893 VINs; 4 in parallel → 9.5s.
  - Test fixture first saved through the Windows console garbled "VEHÍCULOS … MÉXICO" (a
    Mexican-built Freightliner); re-saved as UTF-8. Live decoding was never affected.
  - 11 new tests (271 total).
- [x] **Part 4 — Equipment tab.** New endpoint `GET /carriers/{usdot}/equipment`
  (`services/carrier_equipment_service.py`, `schemas/carrier_equipment.py`): every VIN with its
  vPIC decode, inspections and first/last seen, plus the other USDOT numbers it was inspected
  under (name when loaded, inspections, dates, confidence); counts of shared VINs and invalid
  check digits; fleet = registered power units vs. power units / trailers observed (all time and
  last 24 months; power vs. trailer from the vPIC vehicle type). The tab shows 4 tiles, a neutral
  fleet note (spec 12.5 wording: inspection coverage, never a verdict), filters (power units,
  trailers, seen under other USDOTs, invalid check digit) + search, 25 rows with "Show all", and
  an expandable row listing the other USDOTs (linked) with "not a finding" wording.
  - vPIC is now an API dependency (`get_vpic_client`): every test replaces it with saved
    answers (`offline_vpic` in `tests/conftest.py`); before this, API tests for carriers with
    vehicles quietly called the real NHTSA service.
  - Live (Supabase): 297080 → 2,446 registered, 647 power units + 246 trailers observed (502 in
    24 months), 147 VINs under 92 other USDOTs, 7 invalid check digits (they decode to odd years,
    e.g. a "1988" tank trailer — consistent with typos); response 1.2s for 893 VINs.
    Checked in Chrome: filters, expansion and links work; no console errors.
  - 3 new tests (274 total).

---

## Phase 8 — Intelligence Engine ✅

Deterministic signals; every signal must have evidence. Built part by part: (1) signal engine +
shared VIN + `/signals` API → (2) authority and insurance changes → (3) identity change and fleet
consistency → (4) safety trend and timeline links.

- [x] **Part 1 — Signal engine and Shared VIN (spec 12.3, 13).**
  - `intelligence/base_rule.py`: a rule returns `SignalValues`, each with `EvidenceValues`, from
    stored data only. One file per rule in `intelligence/rules/`.
  - `services/signal_service.py` runs every rule and refuses the whole run if any signal has no
    evidence (`MissingEvidenceError`, nothing saved). Spec 13.2.
  - `repositories/signal_repository.py`: signals have a stable `signal_key` (migration `0009`
    adds it, plus `is_active`, `first_detected_at`, `last_detected_at`). Re-running a rule
    keeps the signal's id and review status and replaces its evidence. A signal the rule no
    longer finds becomes inactive (kept, so a review decision stays on record).
  - Shared VIN rule v1.1: one signal per other USDOT number, two evidence rows per shared VIN
    (seen with the other carrier, seen with this one), each traced to the relationship and its
    raw unit row. Confidence HIGH (2+ inspections or 2+ VINs), MEDIUM (one VIN, one inspection),
    LOW when every shared VIN has an invalid check digit (a typo can match another vehicle).
    Severity LOW, MEDIUM for 3+ VINs. Wording: "potential shared equipment … a relationship to
    review, not a finding" (spec 14).
  - Signals rebuild after every refresh (last step). `GET /carriers/{usdot}/signals` returns
    the active ones, highest severity first, with evidence. `python -m
    app.workers.rebuild_signals [usdot …]` rebuilds from stored data after a rule changes.
  - Supabase (migration 0009): 297080 → 92 signals (11 MEDIUM/HIGH with 3–6 VINs, 18 LOW/HIGH,
    61 LOW/MEDIUM, 2 LOW/LOW from mistyped VINs); a re-run adds nothing.
  - 5 new tests (279 total).
- [x] **Part 2 — Authority change and insurance change (spec 12.1, 12.2).** Both rules reuse
  the timeline's change detection, so a signal and its timeline event always agree. Only
  changes in the last 2 years (`signal_lookback_days` = 730) are signals; older ones stay
  timeline history.
  - `rules/authority_change.py`: one signal per authority action (severity from the action:
    revoked/suspended HIGH, revocation started/inactivated MEDIUM, …, granted/reinstated INFO;
    confidence HIGH), with every source row behind it as evidence (both FMCSA systems when both
    report it, identical copies once). Non-INFO ones say why it matters (spec 12.1 wording). Plus
    "Revocation pending" (MEDIUM) from the authority record.
  - `rules/insurance_change.py`: insurer changed (INFO, "common, not a concern"), coverage
    changed, cancelled, gaps, required BI&PD not on file. Confidence HIGH for a change shown by
    a filing; MEDIUM for gaps / nothing on file (inferred from absence; FMCSA lists may be
    incomplete). A gap's evidence is the filing before and the filing after it.
  - Bug caught on live data: one legacy L&I row holds both the original grant and the
    revocation, so matching evidence by raw record showed "GRANTED" under "Authority revoked".
    Evidence is now matched by the event itself (`authority_event_key`); a test guards it.
  - Supabase: 295014 (revoked 2024-11-13, BI&PD cancelled 2024-11-07 with nothing after),
    3695639 (broker revoked 2026-04-21, trust fund cancelled, inactive), 297569 (new insurer
    + coverage $750k → $1M, both INFO). 295017's 2021 revocation is history, not a signal.
  - 6 new tests (285 total).
- [x] **Part 3 — Identity change and fleet consistency (spec 12.4, 12.5).**
  - `rules/identity_change.py`: legal name (MEDIUM), DBA and email (LOW) from
    `carrier_attribute_history`; physical address, phones, officers (LOW), mailing address and
    web domain (INFO) from the observed-period tables. Before and after values, both rows as
    evidence; confidence HIGH. A carrier's first load is never a change. The census file has no
    change dates, so the date is the day CarrierIQ first saw the new value (said in the text).
  - `rules/fleet_consistency.py`: uses the same numbers as the Equipment tab
    (`EquipmentReader` + `summarize_fleet`, split out of the equipment service). "Limited
    inspection coverage" when 5+ registered and under 25% seen in 24 months; "more power units
    seen than registered" when 3+ more. LOW / MEDIUM confidence, spec 12.5 wording ("does not
    prove non-operation or misconduct"). Evidence: census record, observed comparison, and the
    threshold that fired (RECORD / COMPARISON / THRESHOLD).
  - Supabase: fleet signals for 297080 (501 of 2,446 = 20%) and 295017 (3 of 18). No identity
    changes yet: census history only began when each carrier was first loaded.
  - 6 new tests (291 total).
- [x] **Part 4 — Safety trend, timeline links, review status (spec 12.6, 12.7).**
  - `rules/safety_trend.py`: the carrier against its own history only (no validated benchmark
    exists, spec 12.6): last 12 months vs. the 12 before. "OOS rate rose" (vehicle / driver)
    needs 5+ inspections in each period and a rise of 10+ points to 1.5x (LOW; MEDIUM at 20+
    points; confidence by inspection count). "No inspections in the last 12 months" after 5+
    the year before (LOW). Evidence: both period summaries, the threshold, and up to 10 recent
    OOS inspections. Bug caught by a test: at exactly the threshold (20% → 30%) floating point
    gave a 9.999…-point rise; comparisons are now rounded.
  - Timeline: authority / insurance signals carry their `timeline_event_key`; after each rebuild
    `timeline_events.signal_id` points at the active signal (or none). Exposed on the profile
    timeline as `signal_id`.
  - Review status: profile and search results now report `review_status` (OPEN_SIGNALS /
    NO_OPEN_SIGNALS), `open_signal_count` and `highest_open_severity` (active, OPEN, above INFO).
    Header and search column show "N open signals" coloured by the highest severity; the header
    links to the Intelligence tab (cards arrive in Phase 9). Checked in Chrome, no errors.
  - Supabase: no safety-trend signals among the 11 loaded carriers. BlueTriton shows 93 open
    signals (92 shared equipment + fleet) — Phase 9 should group signals by type.
  - 7 new tests (295 total).

---

## Phase 9 — Intelligence UI ✅

Built part by part: (1) Intelligence tab: summary, grouped signal cards, evidence drawer →
(2) review actions (reviewed / dismissed, with a note) → (3) timeline ↔ signal links and the
relationship view.

- [x] **Part 1 — Intelligence summary, signal cards, evidence drawer.** The Intelligence tab
  (`features/carrier-profile/intelligence/`) loads `/signals`: 4 tiles (high / medium / low /
  information), the "prompts for review, not findings" note, type filter chips, and a "show
  information" toggle (INFO hidden by default). Cards are grouped by type with a count by
  severity, 5 per group then "Show all" (BlueTriton: "Shared equipment · 92 signals · 11
  medium, 81 low"). Each card opens the evidence drawer (Esc / backdrop closes): what the
  records show, every evidence row (type, date, source, stored source record #), and "how this
  was calculated" (rule in plain words + rule id/version, what the confidence level means,
  detection times). Spec 33: "the user must be able to understand why the system generated a
  signal".
  - Removed a duplicate `severityTone` added in Phase 8 Part 4 (one in `utils/status.ts`).
  - Detection dates use the viewer's local date (`formatLocalDate`), like the header.
  - Checked in Chrome (J2Z Trucking, BlueTriton); no console errors. ESLint + build clean.
- [x] **Part 2 — Review actions.** `PATCH /api/v1/signals/{id}` (new `routes/signals.py`,
  `SignalReviewService`) with `{status: OPEN | REVIEWED | DISMISSED, note}` (note ≤ 2,000
  characters, trimmed; 404 / 422 handled). Migration `0010` adds `reviewed_at` and
  `review_note`; reopening clears both. Rules never touch status or note, so a decision
  survives every refresh (tested). The drawer has a Review block (note, Mark reviewed / Dismiss
  / Reopen, "Save note" when already decided); the tab filters Open (default) / Reviewed /
  Dismissed / All with counts, tiles count open signals, cards show the decision and note.
  After a decision the signal list updates at once and the header / search counts refresh.
  - Checked in Chrome on USDOT 295017: reviewed with a note → header "No open signals", then
    reopened (database checked: back to OPEN, no note; no other signal touched).
  - Supabase at migration 0010. 2 new tests (297 total).
- [x] **Part 3 — Timeline ↔ signals and relationship view.**
  - The open signal lives in the URL (`?tab=intelligence&signal=98`), so any link can open its
    evidence drawer and it can be shared. Timeline events that raised a signal show "Review
    signal ›" (only those within the 2-year window; older events are history).
  - `RelationshipView` (Intelligence tab, under the signals): other USDOT numbers whose
    inspections recorded this carrier's VINs, built from the Equipment data — carrier link and
    name (or "not loaded yet"), shared vehicles (expandable VIN list with year / make / model),
    their inspections, dates, and the Shared VIN signal (confidence, review state; opens the
    drawer). Sorted by shared vehicles; 10 then "Show all". `signal_key` added to the signals
    API for the match.
  - Checked in Chrome: J2Z timeline → revocation signal drawer; BlueTriton relationships —
    USDOT 155682 shares 49 vehicles (96 inspections, Nov 2023 – Oct 2026), not loaded yet.
    No console errors; 297 tests passing.

---

## Phase 10 — Background Processing ✅

Spec Section 18 / decision log: no Redis for the MVP — React → FastAPI → PostgreSQL → Python
worker, with the queue swappable later. Built part by part: (1) job queue + worker + retries →
(2) scheduled ingestion + Docker worker service → (3) job status API / dashboard, "refresh now",
and the queue evaluation.

- [x] **Part 1 — Job queue, worker, retry handling.**
  - `jobs` table (migration `0011`): type, JSON payload, status QUEUED / RUNNING / SUCCEEDED /
    FAILED, attempts / max attempts, `run_after`, lock (worker + time), last error, result. A
    partial unique index on `dedupe_key` keeps one pending job per key (e.g. one refresh per
    carrier).
  - `jobs/queue.py`: `JobQueue` interface + `PostgresJobQueue` — claims with `SELECT … FOR
    UPDATE SKIP LOCKED` (several workers never take the same job); failure → QUEUED again with
    exponential backoff (1, 2, 4 minutes) until 4 attempts, then FAILED with the error kept; a
    job locked longer than 30 minutes (dead worker) is requeued.
  - `jobs/handlers.py`: `refresh_carrier` (the same refresh as opening a carrier; `force`
    refreshes every source; a "stale" outcome — a source failed — counts as a failure so it is
    retried) and `rebuild_signals` (stored data only).
  - `workers/worker.py`: `python -m app.workers.worker` (runs until stopped) / `--once` (runs
    due jobs, exits); one database session per job.
  - The refresh assembly moved to `services/carrier_refresh_factory.py` so the API and the
    worker build the identical refresh; `ensure_fresh(..., force=True)` added.
  - Live (Supabase, migration 0011): a forced refresh of 297569 ran through the worker in 18s
    (all sources, signals rebuilt), SUCCEEDED; a duplicate enqueue was refused.
  - `alembic check`: migration matches the models. 6 new tests (303 total).
- [x] **Part 2 — Scheduled ingestion + Docker worker service.** `jobs/scheduler.py`: every
  `schedule_interval_minutes` (15) the running worker queues `refresh_carrier` jobs for carriers
  whose data is older than `carrier_refresh_hours` (never refreshed first, then oldest), at most
  `schedule_batch_size` (50) per round; skips carriers with a refresh already pending and, for
  `schedule_failed_cooldown_hours` (6), those whose refresh gave up. `--schedule` runs one round
  and exits; `SCHEDULER_ENABLED=false` turns it off. `docker-compose.yml` gains a `worker`
  service (same image, `python -m app.workers.worker`, starts after the backend).
  - Bug caught live: scheduled jobs re-checked staleness with their own settings and skipped
    the refresh (`refreshed: False`) when those differed from the round's. A round's jobs now
    carry `force`, since the round already decided the carrier is due.
  - Live (Supabase): a round with a 30-minute window queued 295014 and 295017; the worker
    refreshed both from FMCSA in 33s. With the normal 24h window nothing was due.
  - 4 new tests (307 total).
- [x] **Part 3 — Job status, "refresh now", queue evaluation.**
  - `GET /api/v1/jobs` (counts by status, whether a worker is running, recent jobs; filter by
    status), `GET /api/v1/jobs/{id}`, `POST /api/v1/carriers/{usdot}/refresh` (202; queues a
    forced refresh, or returns the one already waiting). `JobStatusService`, `JobRepository`.
  - Worker heartbeat: `worker_heartbeats` (migration `0012`); a running worker checks in every
    30s; "running" = seen within 3 check-ins. (First version had no `id` column; the schema
    test enforcing id + created_at on every table caught it.)
  - Frontend: Dashboard "Background jobs" card (counts, worker running / not, how to start one,
    recent jobs with carrier links and errors; refreshes every 5s). Carrier header "Refresh now"
    follows its job (queued → running → refreshed / retrying / failed), warns when no worker is
    running, and reloads the carrier's data when it succeeds.
  - `docs/queue-evaluation.md`: PostgreSQL vs Redis vs RabbitMQ vs cloud queues. Decision: stay
    on PostgreSQL (spec 18, decision log); the public sources, not the queue, are the limit.
    Lists when to switch (volume, database load, fan-out, cloud hosting), what to pick, and how
    (one `JobQueue` class; handlers and intelligence untouched).
  - Checked in Chrome: Refresh now on 295023 → "no worker running" warning → `--once` → page
    showed "Refreshed" and the new time by itself; dashboard card correct. No console errors.
  - Supabase at migration 0012. 3 new tests (310 total).

---

## Phase 11 — Network & Identity tab (post-MVP, spec Sections 7 "Network / Fraud", 29) ✅

Prompted by a real client case (MC 1363132: an accidental "ownership change" attestation on
Highway left brokers seeing "MC previously reported as sold"). Goal: per carrier, show what
broker vetting tools are likely to react to, from public records plus team-entered events.
Built part by part: (1) linked carriers via shared contact details → (2) registration health
and ownership events → (3) the Network & Identity tab.

- [x] **Part 1 — Linked carriers through shared contact details.**
  - `ingestion/contact_match.py` (pure): one SoQL filter over the whole Company Census File for
    the carrier's phones (with and without the leading 1), email, physical street address
    (building = street without unit, plus ZIP) and officer names; values are cleaned so they
    cannot alter the query. `classify` says what each row shares: phone, email, address (same
    unit), building (another unit) or officer.
  - `services/contact_link_service.py`: a refresh detail source; each other USDOT becomes
    relationships SHARES_PHONE / SHARES_EMAIL / SHARES_ADDRESS / SHARES_BUILDING /
    SHARES_OFFICER, traced to that carrier's census row (stored under `contact-link:<usdot>`,
    never the bare USDOT key, which is the carrier's own census record). Re-runs keep
    first_seen, count observations, and drop details no longer shared.
  - `rules/shared_contact.py`: one signal per other carrier for phone / email / address /
    officer (a building alone is not a signal). MEDIUM for phone or email, LOW for address or
    officer, +1 when 2+ details are shared with a carrier no longer active; a value shared by
    5+ carriers is most likely a dispatch / compliance / filing service → LOW / LOW, said so.
  - Live (Supabase): MC 1363132 (USDOT 3794204) → 5 same-building links at 7799 Valley View St
    (4 active carriers; two of them share unit H103), no phone / email / officer links, no
    signal — matching the manual research. 3.8s.
  - 8 new tests (319 total).
- [x] **Part 2 — Registration health and ownership events.**
  - Open-data research (subagent, verified on data.transportation.gov): legacy L&I stopped
    updating 2026-05-14; carriers had to claim their USDOT number in Motus (FMCSA Portal +
    Login.gov). Added: Out of Service Orders `p2mt-9ige`, Motus RevokeSuspend `wb4f-neki`
    (`services/registration_orders_service.py`, a refresh detail source; each dataset's full
    answer is one raw record per carrier, so a rescinded order never lingers), and the census
    `prior_revoke_flag` / `prior_revoke_dot_number`. Not usable: Highway, Carrier Assure, RMIS,
    MyCarrierPackets (no open feed). Later candidates: BOC-3 `2emp-mxtb` / `6snj-ed7q`, rejected
    insurance `96tg-4mhf`, crash VINs `aayw-vxb3`, QCMobile API (needs a free webKey).
  - `services/registration_health.py` (pure): checks with status ok / attention / alert / info /
    unknown — Motus vs legacy-only (explained, not alarming), MCS-150 age (24 months),
    prior revocation link (another USDOT = alert; itself = info), out-of-service orders,
    recent revocations / suspensions, undeliverable addresses.
  - Ownership events (spec 29): `identity_events` gains `platform` (migration `0013`).
    `POST /carriers/{usdot}/identity-events` records OWNERSHIP_CHANGE_ATTESTED,
    ATTESTATION_CORRECTED (must point at an attestation of the same carrier, not before it),
    PLATFORM_ALERT, OWNERSHIP_VERIFIED or NOTE; never edited or deleted. Each event goes on
    the timeline; `rules/ownership_event.py` raises "Conflicting ownership attestation on
    Highway" in the spec's Event → Correction → Current state wording ("not a finding of fraud").
  - `GET /carriers/{usdot}/network`: linked carriers (with the shared values), checks,
    ownership state and events, for the Part 3 tab.
  - Bug found: the tests' fake NHTSA override had optional parameters, which FastAPI read as
    request body on POST endpoints that refresh; now a no-argument wrapper.
  - Live (Supabase, migration 0013), MC 1363132: legacy-only registration (attention), MCS-150
    current, no prior revocation / out-of-service / revocation, 5 same-building links. 8.8s.
  - 7 new tests (326 total).
- [x] **Part 3 — Network & Identity tab.** Live public data first; team notes last and
  optional (only for what no public source publishes, e.g. a Highway attestation).
  - Sections: "What a broker's check may flag" (`network/brokerFlags.ts`: each item says why a
    broker may react and what clears it — registration checks needing attention, shared
    contact details, same-building carriers, authority transfers, name / contact changes,
    recorded ownership events), Registration health, Linked carriers (strong links; same-building
    ones behind a link), Identity and ownership history (census changes + authority transfers),
    Notes from your team (list + collapsed form; a correction must pick an attestation).
  - Backend: Motus authority history "Transferred" / "Renumbered" are now recognised (an
    authority transfer is the public record closest to an ownership change; MEDIUM);
    authority_change v1.2.
  - Checked in Chrome on MC 1363132: legacy-only registration flagged with how to clear it,
    5 same-building carriers, all other checks OK; no console errors. 327 tests passing.
- [x] **Insurance renewal estimate.** FMCSA filings have only a start date (no due date), so
  `services/insurance_renewal.py` looks for filings that started about a year apart (330–400
  days, at least 2 yearly renewals) and estimates the next one. States: pattern, upcoming
  (within 30 days), unconfirmed (expected after the source data stopped updating), passed.
  Always worded as an estimate from FMCSA's filing history. Shown under "Insurance on file"
  (`renewals` on `/authority`) and, for unconfirmed / upcoming, as a registration check on the
  Network tab (`renewal_<type>`). Live check, USDOT 297569: BI&PD on MC207446 every June 18 since
  2021, expected 2026-06-18, after L&I froze on 2026-05-14 → "cannot confirm". 333 tests passing.

---

## MVP done when a user can (spec Section 33)

- [x] 1. Open the application
- [x] 2. Search for a carrier
- [x] 3. View normalized carrier information
- [x] 4. View authority and insurance
- [x] 5. View safety/inspection history
- [x] 6. View equipment/VIN information
- [x] 7. View historical changes
- [x] 8. See intelligence signals
- [x] 9. Open a signal
- [x] 10. See the evidence behind it

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
| 2026-10-08 | Phase 4 Part 3: search screen (dashboard box + results page), checked in Chrome. |
| 2026-10-08 | Phase 4 Part 4: carrier profile page, checked in Chrome. Phase 4 complete. |
| 2026-10-08 | Carrier profile sections turned into tabs (Identity default, tab kept in URL). |
| 2026-10-08 | Phase 5 Part 1: inspection violations ingested (876r-jsdb); fixed stale inspection format; Supabase violations validated 1,139/1,139; 178 tests passing. |
| 2026-10-08 | Phase 5 Part 2: safety API (quarterly trends, breakdowns, paged inspection history); 190 tests passing. |
| 2026-10-08 | Phase 5 Part 3: Safety tab charts, violation breakdown, paged inspection history. Phase 5 complete. |
| 2026-10-08 | Phase 6 Part 1: operating authority (Motus + legacy L&I), authority history; migrations 0003–0004 on Supabase; 38/38 live checks; 215 tests passing. |
| 2026-10-08 | Phase 6 Part 2: insurance filings (current + past, Motus + legacy); migration 0005 on Supabase; 11/11 carriers validated; 229 tests passing. |
| 2026-10-08 | Phase 6 Part 3: change detection → timeline events (authority + insurance); migration 0006; fixed authority status precedence (census docket status ≠ authority status); 243 tests passing. |
| 2026-10-08 | Phase 6 Part 4: authority endpoint, insurance status, Authority & Insurance tab, timeline tab with events. Phase 6 complete. |
| 2026-10-08 | Phase 7 Part 1: VIN extraction and VIN → USDOT links (930 VINs in Supabase); batched upserts 69s → 1s; 255 tests passing. |
| 2026-10-08 | Explain private / non-for-hire carriers (census classification, migration 0007) after an empty Authority tab was reported. |
| 2026-10-08 | Phase 7 Part 2: shared VINs across all FMCSA inspections (297080: 147 VINs shared with 92 carriers); batched 26s → 7s; 260 tests passing. |
| 2026-10-08 | Phase 7 Part 3: NHTSA vPIC decoding (930 VINs), parallel batches 42s → 9.5s; migration 0008; 271 tests passing. |
| 2026-10-08 | Phase 7 Part 4: Equipment tab + `/equipment` endpoint; tests never call real vPIC; Phase 7 done; 274 tests passing. |
| 2026-10-08 | Phase 8 Part 1: signal engine (evidence enforced), Shared VIN rule, `/signals` API; migration 0009; 297080 → 92 signals; 279 tests passing. |
| 2026-10-08 | Phase 8 Part 2: authority and insurance change signals (2-year lookback, evidence per source row); fixed evidence matching for legacy rows; 285 tests passing. |
| 2026-10-08 | Phase 8 Part 3: identity change and fleet consistency signals; equipment reader shared with the rule; 291 tests passing. |
| 2026-10-08 | Phase 8 Part 4: safety trend signal, timeline ↔ signal links, review status on profile and search; Phase 8 done; 295 tests passing. |
| 2026-10-08 | Phase 9 Part 1: Intelligence tab — severity summary, signal cards grouped by type, evidence drawer. |
| 2026-10-09 | Phase 9 Part 2: review actions (PATCH /signals/{id}, reviewed / dismissed with a note, reopen); migration 0010; 297 tests passing. |
| 2026-10-09 | Phase 9 Part 3: timeline → signal links (signal in the URL), relationship view of carriers sharing equipment; Phase 9 done. |
| 2026-10-09 | Phase 10 Part 1: PostgreSQL job queue (SKIP LOCKED, dedupe, backoff retries, dead-worker recovery), worker process; migration 0011; 303 tests passing. |
| 2026-10-09 | Phase 10 Part 2: scheduled ingestion (stale carriers queued every 15 min, batch 50, failure cooldown), Docker worker service; 307 tests passing. |
| 2026-10-09 | Phase 10 Part 3: job status API + dashboard card, worker heartbeat, Refresh now, queue evaluation doc; migration 0012; 310 tests passing. All 10 phases done. |
| 2026-10-09 | Dark purple theme (slate scale redefined in `index.css`; charts re-validated for the dark surface) and animated live dashboard (`/api/v1/dashboard`, lucide-react + motion); docs/architecture.md + .html; 311 tests passing. |
| 2026-10-09 | Phase 11 Part 1: linked carriers via shared phone / email / address / officer (census-wide), shared_contact signal; 319 tests passing. |
| 2026-10-09 | Phase 11 Part 2: registration health checks, out-of-service orders and revocations, ownership events with timeline and signal, /network endpoint; migration 0013; 326 tests passing. |
| 2026-10-09 | Phase 11 Part 3: Network & Identity tab (broker-flag summary, registration health, linked carriers, identity history, team notes); authority transfers recognised; 327 tests passing. |
| 2026-10-09 | Insurance renewal estimate from yearly filing dates (Authority tab + Network check); wording pass; 333 tests passing. |
| 2026-10-09 | Signal evidence opens as a centred pop-up instead of a side panel; plain-word labels for shared-contact and ownership-event rules. |
| 2026-10-09 | Address matching ignores spelling differences (SOUTH/S, STREET/ST; query by house number + ZIP); undeliverable-address check names carriers at the same address and whether FMCSA marks them (Vanek: Re-Ship not marked); 335 tests passing. |
| 2026-10-09 | Profile header heads-up: linked carriers by name and USDOT (shared phone / email / address / officer), links to the Network tab; amber when one is not active. |
| 2026-10-09 | BOC-3 process agents from Motus (6snj-ed7q) and legacy L&I (2emp-mxtb): line on each docket card, registration check (ok in Motus / attention if only in frozen L&I or none while authority active); refresh detail source; 337 tests passing. |
| 2026-10-09 | OOS rates by FMCSA's method (vehicle OOS over Level I/II/V/VI inspections, driver over I/II/III/VI) in profile, quarterly trend and safety_trend v1.1; 24-month window with SAFER national averages; Vanek vehicle OOS 4/4 (was shown as 4/30); 338 tests passing. |
| 2026-10-09 | Packet tab (first, default): carrier intelligence packet like Vektor's, without a score: needs attention / in good standing (from broker flags, registration checks, 24-month OOS vs national average), identity & authority, fleet, insurance (renewal, BOC-3), safety, linked carriers, recent events; Download / Save as PDF prints only the packet in light colours. |
| 2026-10-09 | Source labels: header status boxes (equal height) name their FMCSA source (authority: Motus / L&I, registration: census, insurance, linked carriers: census); packet sections and non-census fields name theirs; Safety trend charts equal height. |
| 2026-10-09 | Packet tab moved after Network & Identity; carriers open on Identity again. |
| 2026-10-09 | CSA BASICs from FMCSA SMS (AB/C Pass and PassProperty; percentiles and alerts only where FMCSA publishes them, i.e. passenger carriers) and crashes from FMCSA's Crash File (5 years, grouped by report); Safety tab sections and Crashes stat, packet safety block and attention items; refresh detail source; 343 tests passing. |
| 2026-10-09 | BOC-3, SMS and crash data fetched for all 14 loaded carriers; Safety and Equipment boxes and Safety sections name their FMCSA / NHTSA source. |
