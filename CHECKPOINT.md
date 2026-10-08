# CarrierIQ — Project Checkpoint

Running record of what has been built and what is left, phase by phase.
Phases come from `../PROJECT_SPECIFICATION.md` (Section 26). Update this file at the end of every work session.

**Last updated:** 2026-10-08
**Current phase:** Phase 6 complete → Phase 7 (Equipment / VIN) is next

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
| 7 | Equipment / VIN | ⏭️ Next |
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
