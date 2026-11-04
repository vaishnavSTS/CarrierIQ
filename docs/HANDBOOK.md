# Carrier Safety Scan — Handbook

Everything an engineer (or an AI agent) needs to pick this project up and carry on: what the
product is, who it's for, how it's built, how to run, test and deploy it, what has been done so far,
what is still open, and the rules the owner works by. **Read sections 1, 12 and 14 before changing
anything.**

_Last updated: 2026-11-04 (after commit `db888e4`, "Portal redesign")._

---

## Contents

1. [The product in one page](#1-the-product-in-one-page)
2. [Who uses it: audiences and portals](#2-who-uses-it-audiences-and-portals)
3. [Live addresses, accounts and hosting](#3-live-addresses-accounts-and-hosting)
4. [Architecture and stack](#4-architecture-and-stack)
5. [Repository map](#5-repository-map)
6. [Running it locally](#6-running-it-locally)
7. [Testing and quality gates](#7-testing-and-quality-gates)
8. [Deploying and checking a deploy](#8-deploying-and-checking-a-deploy)
9. [Data sources](#9-data-sources)
10. [Features, area by area](#10-features-area-by-area)
11. [Design system](#11-design-system)
12. [Working rules (must follow)](#12-working-rules-must-follow)
13. [What has been done: history](#13-what-has-been-done-history)
14. [Open items and pending decisions](#14-open-items-and-pending-decisions)
15. [Launch checklist (official domain)](#15-launch-checklist-official-domain)
16. [Gotchas and quirks](#16-gotchas-and-quirks)
17. [Reference: environment variables](#17-reference-environment-variables)
18. [Reference: routes](#18-reference-routes)

---

## 1. The product in one page

**Carrier Safety Scan** (written with spaces in all visitor-facing text; the code, repo and some
internal names still say `CarrierSafetyScan` / `CarrierIQ`) is a web app built and run by
**Sky Transport Solutions (STS)**, a trucking compliance company (Tracy, CA; phone (800) 498-9820;
skytransportsolutions.com). Every page shows "Powered by Sky Transport Solutions".

It turns FMCSA's public records about a US trucking company (a "carrier", identified by its USDOT
number and MC docket) into a clear picture of:

- **Authority & insurance** — is the operating authority active, what insurance is on file vs what's
  required, BOC-3 process agent, revocations, an *estimated* renewal month.
- **Safety** — every roadside inspection and violation, out-of-service (OOS) rates vs the national
  average, CSA BASICs, crashes, and the **Estimated ISS** (1–100), Carrier Safety Scan's own
  rebuild of FMCSA's Inspection Selection System score (never presented as FMCSA's official score).
- **Fraud / identity signals** — other carriers sharing a phone, email or address, chameleon
  carriers (re-registered under a new USDOT to escape a revocation), shared VINs, identity changes.
- **What to do about it** — plain-English "how to fix" guidance, and STS services to fix it
  (DataQs challenges of wrong inspections, compliance filings), paid online.

Business goals: help **carriers** look good to brokers (and buy STS services), help **freight
brokers** vet carriers before booking loads, help **insurance agents** understand a trucking risk
before quoting. Revenue: a monthly subscription after a free trial (price not yet final — see §14),
a $50 per-inspection DataQs filing fee, and paid compliance services.

The original product specification is `../PROJECT_SPECIFICATION.md` (one folder above the repo);
`CHECKPOINT.md` in the repo root is the phase-by-phase build record.

---

## 2. Who uses it: audiences and portals

| Audience | Signs up with | Portal | Home route | Frame |
|---|---|---|---|---|
| **Carrier** (trucking company; internally "client") | USDOT number (one account per USDOT: "claim your company") | Carrier portal | `/portal` | `PortalShell` (navy sidebar) via `PortalLayout` |
| **Freight broker** | MC or USDOT number, checked against FMCSA broker authority | Broker portal | `/broker` | `PortalShell` via `BrokerLayout` |
| **Insurance agent** | National Producer Number (NPN), shown to STS, not verified | Same broker routes, own home page (`AgentHomePage`), label "Insurance agent portal", **no Booking check** | `/broker` | same |
| **STS staff** | Created only by CLI (`python -m app.workers.create_staff_user`) | Internal app | `/dashboard` | `AppLayout` (top bar) |
| **Visitor** | — | Public site, plus **Try Now**: one free carrier search with no account | `/` | `PublicLayout` |

Roles (backend `app/models/enums.py`): `STS_ADMIN`, `STS_ANALYST` (internal); `CLIENT_ADMIN`,
`CLIENT_USER` (carrier; `CLIENT_USER` is view-only); `BROKER_ADMIN`, `BROKER_USER`,
`INSURANCE_AGENT` (broker portal).

**What each sees on a carrier's page** (`frontend/src/pages/CarrierProfilePage.tsx`):

- Carrier, own carrier: Overview, Authority & Insurance, Inspections, Equipment, **How brokers see
  you** (the network tab), Safety Score Report, Compliance, Invoices, History.
- Broker / agent, any carrier: the same minus Compliance and Invoices, plus **Chameleon check**;
  the network tab is called **Linked carriers**. Brokers also get the **Booking check** verdict on
  top; agents don't.
- Staff: everything except Compliance and Invoices, plus **Intelligence** (signals, review). Staff
  handle compliance and invoices on their own Service requests / Invoices pages.
- Carriers can only open **their own** carriers unless `CLIENT_SEARCH_ENABLED` is on (team testing;
  off on Render).

---

## 3. Live addresses, accounts and hosting

| What | Where |
|---|---|
| Live app | https://carriersafetyscan.vercel.app (old https://carrier-iq.vercel.app still opens, Google sign-in only works on the new one) |
| Backend API | https://carrieriq-api.onrender.com (`/api/v1/health`, docs at `/docs`) |
| Repo | github.com/vaishnavSTS/CarrierIQ, branch `main` |
| Frontend host | Vercel (builds only when `frontend/` changes) |
| Backend host | Render, **free plan**, Docker, `render.yaml` blueprint, service `carrieriq-api`, deploys on every push touching `backend/` |
| Database | Supabase PostgreSQL (session pooler, port 5432, `sslmode=require`) |
| Evidence files | Supabase Storage via S3 API (`DATAQS_STORAGE_*`) |
| Payments | Stripe (sandbox set up; live mode still to do) |
| Email | Gmail API (live credentials in `backend/.env` and Render) |
| Bot protection | Cloudflare Turnstile (keys in Render and `backend/.env`) |
| Deploy status | GitHub Actions `deploy-check.yml` + README badges |

The free Render backend **sleeps** after ~15 idle minutes; the first request then takes about a
minute. It runs **without a background worker** (`RUN_WORKER_IN_API=false`), so scheduled refreshes
and the monthly ISS reference build don't run in production (see §15).

**Secrets never go in git, logs or chat.** They live in `backend/.env` (git-ignored) and in the
Render / Vercel dashboards.

---

## 4. Architecture and stack

```
Browser ──► Vercel (React SPA) ── /api/* rewrite ──► Render (FastAPI) ──► Supabase Postgres
                                                        │
                                                        ├─► FMCSA via Socrata (data.transportation.gov)
                                                        ├─► FMCSA QCMobile (EIN), NHTSA vPIC (VIN decode)
                                                        ├─► SAFER (UCR status page), Stripe, Gmail API
                                                        └─► Twilio (FMCSA login codes), Turnstile, Google OAuth
```

The browser only talks to the Vercel domain; `frontend/vercel.json` rewrites `/api/:path*` to the
Render service, so the session cookie and Google sign-in work as on localhost.

**Backend** — Python ≥3.12 (Docker/CI use 3.13), FastAPI, Pydantic, SQLAlchemy 2.0, Alembic,
psycopg 3, httpx, PyJWT, boto3, reportlab (invoice PDFs), openpyxl (Excel). Layered:
route → service → repository. PostgreSQL job queue (no Redis). Auth: HS256 JWT in an HttpOnly cookie
`carrieriq_session` (8 h), scrypt password hashes, purpose tokens for reset / verify / Google sign-up.

**Frontend** — React 19, TypeScript (strict), Vite, Tailwind CSS 4, TanStack Query, React Router,
`motion/react`, lucide-react icons, Fontsource fonts. API calls via `src/api/client.ts` to `/api/v1`.
QueryClient: 401 → `me` set to null (route guard sends to login); 402 → refetch `me` (subscription
pop-up); 401/402/403 never retried.

---

## 5. Repository map

```
CarrierIQ/
├── backend/                 FastAPI app (see below)
├── frontend/                React app (see below)
├── docs/
│   ├── HANDBOOK.md          this file
│   ├── architecture.md/.html  architecture overview and flowcharts
│   ├── estimated-iss-v1.md  how the Estimated ISS is computed and validated
│   ├── DataQ.md             DataQs build plan (phases 0–6)
│   ├── client-internal-portal-plan.md  portal plan (tabs per audience)
│   ├── partner-api.md       Partner API (ISS by API key)
│   └── queue-evaluation.md  why a Postgres job queue
├── CHECKPOINT.md            phase log + session log (update at end of sessions)
├── README.md                setup, deploy, badges
├── render.yaml              Render blueprint
├── docker-compose.yml       backend + worker + frontend (+ db with --profile localdb)
├── docker-compose.localdb.yml
└── .github/workflows/       ci.yml (manual), deploy-check.yml (on deployments)
```

One folder up (`C:\Vaishnav\CarrierSafetyScan\`) are non-code assets: `PROJECT_SPECIFICATION.md`,
the Terms of Service / Privacy Policy `.docx`, FMCSA data dictionaries, sample invoices, the
Developer Brief and Brief Checklist PDFs, logos, `UI Updates.pdf`, and `.demo/` (local scripts and
screenshots, see §6).

### Backend (`backend/app/`)

- `main.py` — app factory, CORS, request IDs; refuses to start outside `local` with the dev secret;
  starts background threads (DataQs email dispatch, OTP wiper, DataQs verification).
- `api/` — `auth.py` (login deps: `get_current_user`, `require_staff`, `require_sts_admin`,
  `require_client`, `require_broker`, `require_own_carrier`, subscription lock 402),
  `bot_protection.py` (rate limits + Turnstile `require_human`), `v1/routes/*.py` (all routes under
  `/api/v1`, see §18).
- `core/` — `config.py` (all settings, §17), `security.py`, `google_oauth.py`, `turnstile.py`,
  `rate_limit.py` (in-memory, per process), `exceptions.py`, `logging.py`.
- `ingestion/` — source adapters + pure normalizers: Socrata client, census, inspections, operating
  authority, insurance, BOC-3, registration/OOS orders, SMS results & crashes, QCMobile, vPIC,
  contact matching, fingerprints.
- `services/` — ~95 modules of business logic: carrier refresh/ingestion, profile tabs (profile,
  safety, authority, equipment, network, chameleon), `client_view.py` (strips STS-internal data),
  search, signals/timeline, ISS (`iss_service`, `high_iss_service`, `partner_iss`, `pull_in`), auth &
  emails, billing (`subscription`, `stripe_client`, `invoice_service`, `invoice_pdf`), compliance
  (`compliance_service`, `compliance_pricing`, `ucr_service`), `broker_authority`, `twilio_client`,
  ~22 `dataqs_*` modules, `registration_health` (broker-check flags).
- `repositories/` — one per aggregate. `models/` — 57 tables, one file each; `enums.py`.
- `schemas/` — Pydantic models per area (`auth.py` holds `TERMS_VERSION`).
- `intelligence/` — `base_rule.py`, `iss_estimate.py` (pure Estimated ISS), `rules/` (8 rules, §10.4).
- `jobs/` — `queue.py` (Postgres `FOR UPDATE SKIP LOCKED`), `handlers.py`, `scheduler.py`.
- `workers/` — `worker.py` (`--once`, `--schedule`), `create_staff_user.py`, `gmail_authorize.py`,
  `new_partner_key.py`, `rebuild_signals.py`.
- `alembic/versions/` — 53 migrations, `0001` … `0053` (latest: `0053_no_officer_links`).
- `tests/` — 91 files, ~655 tests: `api`, `dataqs`, `ingestion`, `intelligence`, `jobs`, `models`,
  `services`, `fixtures/`, plus `conftest.py`, `factories.py`, `test_no_real_email.py`.

### Frontend (`frontend/src/`)

- `main.tsx` (QueryClient, fonts, `index.css`), `router.tsx` (all routes, §18), `theme.ts`.
- `pages/` — one file per route.
- `components/` — shared UI; `components/layout/`: `PublicLayout`, `PublicHeader`, `PortalShell`
  (navy sidebar frame), `PortalLayout` (carrier), `BrokerLayout`, `AppLayout` (staff), `SiteFooter`,
  `TalkToSky`, `Brand`, `ThemeToggle`, `ScrollToTop`; `components/auth/RequireAuth.tsx`.
- `features/` — `landing` (public pages, `HeroTools`, `photos.ts`, `landingParts` Band/Accent/
  SectionHeading), `portal` (+ `carrier/`, `broker/`, `agent/` home parts), `portal-tour`,
  `compare` (vetting, Compare, Booking check), `dataqs` (+ `intake/`, `staff/`), `billing`,
  `carrier-search`, `carrier-profile` (+ `safety/`, `network/`, `chameleon/`, `compliance/`,
  `intelligence/`, `packet/` = Safety Score Report), `auth`, `legal`, `audience`, `invoices`,
  `accounts`, `dashboard`, `system-status`, `try-now`.
- `hooks/` — TanStack Query hooks per area (`useAuth`, `useCarrier*`, `useDataQs`, `useBilling`,
  `useInvoices`, `useCompliance`, `usePortalMode` …). `api/` — fetch functions per area.
- `index.css` — design tokens, theme, bands, print rules (§11).
- `frontend/scripts/report-check.mjs` — 20-carrier Safety Score Report print check.

---

## 6. Running it locally

### Plain dev setup (from README)

```bash
# backend
cd backend && python -m venv .venv && .venv/Scripts/activate
pip install -e ".[dev]"
cp ../.env.example .env        # fill DATABASE_URL (Supabase) etc. — never commit
alembic upgrade head
uvicorn app.main:app --reload --port 8000
# frontend
cd frontend && npm install && npm run dev      # http://localhost:5173, proxies /api to :8000
```

Or `docker compose up --build` (backend, worker, frontend on Supabase); add
`-f docker-compose.localdb.yml --profile localdb` for a local Postgres.

> **Do not start or stop anything on ports 8000 / 5173** — those are the owner's own servers.
> Use the demo servers below.

### Demo servers used for screenshots (safe, never send email)

Scripts live in `C:\Vaishnav\CarrierSafetyScan\.demo\` (outside the repo).

```bash
# API on 8011 against the local test DB; blanks email + Turnstile settings
cd CarrierIQ/backend && PYTHONPATH=. .venv/Scripts/python.exe ../../.demo/demo_api.py
# Vite on 5197 proxying to it
cd CarrierIQ/frontend && API_PROXY_TARGET=http://127.0.0.1:8011 npx vite --port 5197 --strictPort
```

- Test DB: `postgresql+psycopg://postgres:localtest@localhost:55432/carriertest` (local Docker
  Postgres; seeded test data). Demo logins use password `correct-horse-battery`:
  `owner@acme.test` (carrier, USDOT 7654321), `b@broker.test` (broker),
  `agent1793406791989@agency.test` (insurance agent), `analyst@sts.test` (staff).
- Screenshot scripts (Edge headless via CDP): `site_shots.mjs URL prefix port` (public pages),
  `dark_shots.mjs` (same, dark theme), `phone_menu.mjs` (390 px + open menu), `hover_shots.mjs`,
  `rd_shots.mjs PORT EMAIL THEME prefix=path@width@height …` (logged-in pages; one login per run —
  the login endpoint is rate-limited), `rep_pages.mjs` (a report's printed pages),
  `report_20.mjs` (20-carrier report check). Output in `.demo/ui/`.
- **Git Bash path conversion:** run `rd_shots.mjs` with `MSYS_NO_PATHCONV=1`, otherwise arguments
  like `x=/broker` are rewritten to Windows paths.
- Stop demo servers with PowerShell:
  `foreach ($p in 8011,5197) { Get-NetTCPConnection -LocalPort $p -State Listen | % { Stop-Process -Id $_.OwningProcess -Force } }`

---

## 7. Testing and quality gates

Run all of these before asking to push:

```bash
# frontend (from frontend/)
npx prettier --check src     # semi:false, singleQuote, printWidth 100, trailingComma all
npx tsc -b                    # strict
npx eslint src                # 0 errors (a handful of existing react-refresh warnings are OK)
npx vite build
npx vitest run                # 26 tests: report maths, MCS-150 due dates, portal action items

# backend (from backend/)
.venv/Scripts/python.exe -m ruff check app tests
.venv/Scripts/python.exe -m ruff format --check .
.venv/Scripts/python.exe -m mypy app        # strict; 2 pre-existing union-attr errors in auth (organization None)
TEST_DATABASE_URL=postgresql+psycopg://postgres:localtest@localhost:55432/carriertest \
  .venv/Scripts/python.exe -m pytest -q    # DB tests skip without TEST_DATABASE_URL
```

- Older instructions say to run ruff with `--exclude app/services/dataqs_credential_encryption.py`
  and never touch that file. The source file **no longer exists** (the FMCSA-credentials feature
  was removed in migration 0035); only stale `.pyc` files remain. Keep the rule: never rebuild
  anything that stores or relays carriers' FMCSA passwords or one-time codes beyond the existing
  short-lived OTP flow.
- `tests/conftest.py` blanks all email settings and `tests/test_no_real_email.py` guards it — keep
  both (see §12).
- **Safety Score Report:** after report changes, typecheck/lint/build and look at one or two printed
  pages (`.demo/rep_pages.mjs`). Run the full 20-carrier check (`npm run report-check` /
  `report_20.mjs`, ~5 min) **only when the owner asks**.
- CI (`ci.yml`) runs only when started by hand.

---

## 8. Deploying and checking a deploy

1. Finish the change, run §7, take screenshots (light, dark, phone) of what changed and show them.
2. **Ask "Shall I push?" and wait for an explicit yes** (§12).
3. Stage **explicit files only** (never `git add -A` / `-u` together with a push), commit, then push
   in a separate command:
   ```bash
   git add -- path/one path/two
   git commit -F - <<'EOF'
   Short subject in plain English

   - bullet of what changed

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   EOF
   git push origin main
   ```
4. A push redeploys only what changed: `frontend/` → Vercel, `backend/` → Render. A commit touching
   only `.github/` or docs triggers no deploy (and no deploy-check run).
5. Verify it's live by looking for **text that only exists in the new build** in the live bundle
   (don't reuse a string that was already there):
   ```bash
   js=$(curl -s https://carriersafetyscan.vercel.app/ | grep -o '/assets/index-[^"]*\.js' | head -1)
   curl -s "https://carriersafetyscan.vercel.app$js" | grep -c "some new string"
   ```
   For backend changes, hit the new endpoint on `https://carrieriq-api.onrender.com` (a 404 means
   not deployed yet; 401/422 means it exists).
6. `deploy-check.yml` looks for `<title>Carrier Safety Scan</title>` on the live site.

---

## 9. Data sources

FMCSA open data on Socrata (data.transportation.gov), each dataset ID configurable (`*_DATASET_ID`):

| Data | Dataset |
|---|---|
| Company Census (MCS-150) | `az4n-8mr2` |
| Inspections / inspection units / violations | `fx4q-ay7w` / `wt8s-2hbx` / `876r-jsdb` |
| Motus: carrier, authority history, insurance, insurance history, revoke/suspend, BOC-3 | `inys-ebih`, `yu5v-wbh6`, `c5y8-a4uz`, `3uet-3z4i`, `wb4f-neki`, `6snj-ed7q` |
| Legacy L&I (frozen, `LEGACY_LI_FROZEN_ON`): carrier, authority history, insurance, history, BOC-3 | `6eyk-hxee`, `9mw4-x3tu`, `ypjt-5ydn`, `6sqe-dvqs`, `2emp-mxtb` |
| OOS orders | `p2mt-9ige` |
| Crash file | `aayw-vxb3` |
| SMS results (AB/C × pass/property) | `m3ry-qcip`, `h3zn-uid9`, `4y6x-dmck`, `h9zy-gjn8` |
| SMS inputs: violations, crashes, census | `8mt8-2mdr`, `4wxs-vbns`, `kjg3-diqy` |

Other sources: **FMCSA QCMobile** (EIN for the Chameleon check; compared, never shown),
**NHTSA vPIC** (VIN decode), **SAFER** UCR query page (scraped, cached 1 h), **PrePass** state
pull-in rates by ISS band (seeded table `iss_pull_in_rates`).

Carriers are loaded **on demand** the first time someone searches them (seconds; large fleets can
take minutes). Raw source rows are kept in `raw_records`; normalized data in canonical tables;
changes recorded in `carrier_attribute_history` / snapshots.

**Public pages must not say where the data comes from** (owner's rule, 2026-11-04). Inside the
logged-in portals and the report, source labels are fine and expected.

---

## 10. Features, area by area

### 10.1 Public site (`PublicLayout`)

- **Front door `/`** (`AudienceChooserPage`): "Welcome to Carrier Safety Scan — Choose one of the
  options below to see what Carrier Safety Scan does for you." Three full-photo cards (carrier /
  freight broker / insurance agent) with label, text, "what's inside" chips and Continue, plus
  "30 days free · No card needed to start · Cancel any time" and "Just looking? Try one free
  search". **Asked every visit; nothing stored**: on mount it deletes the old `css_audience` /
  `css_consent` cookies and session key. Logged-in users go straight to their portal.
- **Header** (`PublicHeader`): dark announcement bar ("NEW · Try the Safety Score Report free on any
  carrier", phone, Contact), menu (For carriers / For brokers / For insurance agents / How the score
  works), theme switch, Log in, Free trial, Schedule a demo (`/contact?demo=1`, pre-fills the
  message). ☰ drawer on phones.
- **Audience pages** `/for-carriers`, `/for-brokers`, `/for-insurance-agents` (`LandingPage`):
  hero with a faint per-audience photo, search box with "Search by" chips (MC mode prefixes "MC "),
  and a working **hero tool** (`features/landing/HeroTools.tsx`):
  - carriers: **"When is your MCS-150 update due?"** — `mcs150Due()` per 49 CFR 390.19(b): last
    USDOT digit → month (0 = October), next-to-last digit odd/even → odd/even years, due by month
    end, every 24 months (tested);
  - brokers: **Quick booking check** — six switches, same verdict rules as the portal;
  - agents: **"What liability minimum applies?"** — 49 CFR 387.9 / 387.33: general freight
    $750,000; oil/hazmat $1,000,000; certain bulk hazmat & explosives $5,000,000; passengers ≤15
    seats $1,500,000; 16+ $5,000,000. (The $300,000 under-10,001-lb figure was deliberately left
    out: unverified.)
  Then a scrolling strip of checks, banded sections with numbered headings: features with real
  photos, **Inside the portal** (every portal part, linking to the tour), DataQs (carriers only),
  phone showcase, Safety Score Report preview (sample, made-up carrier), how it works, sign-up CTA,
  "Built by Sky Transport Solutions".
- **Portal tour pages** `/for-…/portal` (`PortalTourPage`, text in `features/portal-tour/
  tourContent.tsx`, sample screens in `TourVisuals.tsx`): every part of that portal with a
  sample screen, sticky section menu, plan card (30 days free, no card), FAQ, CTA.
- **Try Now** `/try`, `/try/:usdot`: one free carrier search per visitor (keyed hash in `try_uses`),
  by USDOT, MC or name; opens the carrier in broker mode with every tab; sign-up pop-ups.
- `/contact` (form emails STS; Turnstile), `/methodology` (how the Estimated ISS works),
  `/c/:usdot` (link printed on reports: log in, then open in your portal).
- **Auth pages** per audience: `/login`, `/register`, `/register/google`, `/broker/login`,
  `/broker/register`, `/broker/register/google`, `/insurance/login`, `/insurance/register`,
  `/insurance/register/google`, `/team/login` (staff, no sign-up), `/forgot-password`,
  `/reset-password`, `/verify-email`. Sign-up requires ticking **"I agree" to the Terms and Privacy
  Policy** (pop-ups, text in `features/legal/legalText.ts`, recorded as `terms_accepted_at` +
  `TERMS_VERSION`). Turnstile + honeypot on forms. **Continue with Google** for all three audiences.
- Photos: Pexels (free licence) and Unsplash; the carrier card on the front door is **iStock
  1215704434, licensed by STS** (612 px preview copy — a full-size licensed file would be sharper).
  No photo may show a readable company name or licence plate. Sources in `features/landing/photos.ts`.

### 10.2 Portals (`PortalShell`)

Navy sidebar (logo, portal label, pages, user card, theme, Manage subscription, Log out); slide-in
drawer on phones. Portal pages use the public site's fonts; the report keeps the app font.
`SubscriptionGate` wraps every portal page: trial banner with days left; when the trial ends with
no subscription the app locks behind a pop-up to Stripe (invoices stay reachable).

- **Carrier portal home** (`PortalHomePage` + `features/portal/carrier/`): banner with counts
  (carriers linked, open DataQs, waiting on you); per carrier an **Action center** (broker-check
  flags with "Fix with Sky", DataQs cases waiting on the carrier, MCS-150 month per 390.19,
  expected renewals labelled *Estimate*), Estimated ISS dial, OOS bars vs national average,
  authority/registration card, jump links to every tab, DataQs panel, guide, subscription panel.
- **Carrier DataQs page** `/portal/dataqs`: $50-per-inspection card with Start a request, Open /
  Waiting on you / Closed counts, waiting list, all requests, contact strip, start-a-request table.
- **Broker home** (`BrokerHomePage` + `features/portal/broker/`): hero with search and the four
  booking-check verdicts explained, Compare list (session-only) with each carrier's verdict,
  "Your brokerage" card (authority as checked at sign-up), "What to check before booking" (links to
  tabs) + "Still on you" (insurance certificate, call, W-9, agreement), four-step guide.
- **Insurance agent home** (`AgentHomePage` + `features/portal/agent/`): "Look up the carrier
  you're quoting" with agency + NPN, underwriting checklist (which tab answers which question),
  federal liability minimums, "Not in FMCSA's public record" card. Wired in `BrokerHomePage` by
  role.
- **Compare** `/broker/compare` (and `/compare` for staff): up to 3 carriers (`?usdot=1,2,3`),
  grouped rows (authority & insurance, safety, red flags, about), best value marked, verdict cards
  and "how we decide" — **hidden for insurance agents**.
- Invoices: `/broker/invoices` (subscription invoices), `/portal/invoices/:id`.

### 10.3 Carrier profile & Booking check

Header (`ProfileHeader`): brand strip, name, DBA, USDOT/MC pills (SAFER / SMS links), refreshed
time, plain summary, status cards (Estimated ISS ring, Authority, Registration, Insurance; staff
also Review status), linked-carriers heads-up, Compare button (broker portal), Refresh (staff).
Tabs are sticky pills; open tab kept in `?tab=`.

**Booking check** (`features/compare/vetting.ts`, shown via `BrokerVerdict`): verdict = any stop →
**Do not book**; any major item or ≥3 minor → **High risk**; any minor → **Book with review**;
else **Ready to book**. Stops: authority not active / revocation pending, active OOS order,
Unsatisfactory rating, no liability or below the legal minimum. Major: Conditional rating, crash
BASICs over threshold, ISS ≥75, red flags, new authority with 10+ trucks, fatal crash, OOS rate
≥2× national. Minor: authority <6 months, revoked in last 3 years, liability <$1M, renewal ≤30
days, <3 inspections, ISS At risk, other BASICs over, OOS above national, injury crash,
registration/identity items. Always with "isn't a safety rating or a guarantee".

### 10.4 Intelligence engine (staff)

8 deterministic rules in `backend/app/intelligence/rules/` producing evidence-backed signals over a
730-day window: `authority_change`, `insurance_change`, `identity_change`, `fleet_consistency`,
`safety_trend`, `shared_vin`, `shared_contact` (phone/email/address — **officer names no longer
link carriers**, migration 0053), `ownership_event`. Review status OPEN / REVIEWED / DISMISSED.
Wording rule: attribute every finding to its record, no verdicts.

### 10.5 Estimated ISS

`docs/estimated-iss-v1.md`, `app/intelligence/iss_estimate.py`: rebuild of FMCSA's ISS from public
SMS data — BASIC percentiles by peer group (SMS v3.21), thresholds (65% Unsafe Driving/HOS/Crash,
80% others), ISS group 1–13, value within band; insufficient-data carriers 63–77. Bands shown as
**Satisfactory (1–49) / At risk (50–74) / High risk (75–100)**. Monthly lookup tables in
`iss_references`; history in `iss_snapshots`. Validated on 22 real values. Always labelled
"Carrier Safety Scan's estimate, not FMCSA's official score". Staff **High Safety Score** list
(`/high-iss`, ISS ≥75, Excel export). **Partner API** `GET /api/v1/partner/iss/{usdot}?month=`
with `X-Api-Key` (hashes in `PARTNER_API_KEY_HASHES`; `docs/partner-api.md`).

### 10.6 Safety Score Report (most sensitive part)

`frontend/src/features/carrier-profile/packet/` (`PacketSection.tsx`, `printFit.ts`). Sheets:
Carrier safety scorecard (score dial + last month, why, red items with "How to fix it" first, OOS
rates, yellow, green "In good standing", BASIC tiles), How to improve, Carrier record, Inspection
record / history, **All inspections** (every one, red out-of-service labels). STS contact strip +
QR on every page; "Download / Save as PDF" uses `window.print()`.

Printing: the document is rendered off-screen at A4 width, `paginateReport()` clones sections onto
`.print-page`s at **zoom 0.92**, splits `[data-split]` tables between rows with repeated headers,
needs **≥3 rows** on a page to start a section, drops orphaned titles, numbers pages. In print the
minimum text is **13px**; on screen ≥40rem the report shows at the same 0.92 size. The report uses
the app font (not the marketing fonts). **Every statement must be verified** (§12).

### 10.7 DataQs (challenge wrong inspections)

`docs/DataQ.md`; ~22 backend `dataqs_*` services; frontend `features/dataqs/`. Carrier owner opens a
case from an inspection (whole inspection or specific violations, reason, source, review), signs
consent, pays the **$50 fee** (Stripe), approves the exact package (SHA-256 manifest); STS assesses,
builds and **files by hand** in FMCSA's DataQs portal (no API), records proof, tracks agency
correspondence, appeals and deadline clocks (filing 3 years inspections / 5 crashes; agency review
21/21/45 days; info 14 days; appeal 30 days), then **verifies** the correction in FMCSA's data.
FMCSA login codes via text / call / scheduled call / carrier authorizing STS as agent; codes wiped
after 10 minutes. Statuses: Draft, Evidence needed, STS review, Awaiting approval, Ready to file,
(Submission unconfirmed), With the agency, Verifying correction, Closed. Emails via an outbox;
staff reminders; supervisor view + CSV audit. Brokers have no DataQs access.

### 10.8 Compliance services, invoices, subscription

- **Compliance tab** (carriers, own carrier): DOT/MC authority status, UCR (read from SAFER), CA MCP
  for California carriers; order drug & alcohol consortium, driver files, MVR, background check,
  certificate of good standing. Priced services pay online (Stripe Checkout, invoice created, STS
  emailed); others are requests STS handles (`/service-requests`). Prices in
  `compliance_pricing.PRICES`.
- **Invoices**: own invoices (UNPAID/PAID/VOID/REFUNDED), PDF (reportlab), pay online, emailed PDF
  when paid; staff can void.
- **Subscription** (`services/subscription.py`): 30-day trial from sign-up (restarts on email
  confirmation), then **$49/month in code** (price not final — see §14), Stripe subscription;
  cancel at period end (app button and Stripe portal); `billing_state` = free / trial / active /
  locked (402 on locked except auth, billing, invoices, DataQs fee). Staff and pre-subscription
  accounts are free.

### 10.9 Accounts & sign-up

Sign-up opens the portal at once (after email confirmation when required). Broker sign-up checks
FMCSA broker authority. One carrier account per USDOT (`carrier_claims`; STS can release). STS
admins see a new-sign-up banner and manage accounts at `/accounts` (disable, reactivate, link a
carrier, release a claim). Welcome, verification and password-reset emails.

### 10.10 Staff app (`AppLayout`)

Dashboard (alerts, animated board, live signal feed, severity breakdown; jobs card hidden until a
worker runs), Search, Compare, carrier pages with Intelligence, DataQs queue and case rooms,
High Safety Score, Service requests, Invoices, Accounts (admin).

---

## 11. Design system

- **Fonts** (self-hosted Fontsource, imported in `main.tsx`): Bricolage Grotesque (headings
  `h1/h2`, `.brand-name`), Manrope (body), Instrument Serif italic (`.font-accent` highlighted
  words on public pages), JetBrains Mono (`.font-label` small uppercase labels, `font-mono`). Scoped
  to `.landing-page` (public) and `.portal-type` (portals) in `index.css` `@layer base`;
  `.app-type` and `#carrier-packet` fall back to the app font. The front door heading uses plain
  Bricolage with **no italic accent** (owner's choice).
- **Colours**: tokens in `@theme` in `index.css` (canvas, surface, cta, accent, status colours,
  custom slate/violet/amber/… scales). Navy `#101853` / `#060d24`, gold `amber-300/400`, violet
  `accent-strong` for links.
- **Dark mode** (`theme.ts`, `data-theme="dark"`, applied before first paint): the slate scale is
  **inverted** (slate-950 becomes white). Anything that must stay dark in both themes uses fixed
  hex (`bg-[#101853]`, `bg-[#060d24]`), never `bg-slate-950`, and never `text-slate-900` on a fixed
  dark background. Check every UI change in both themes.
- **Patterns**: cards `rounded-2xl border border-slate-200 bg-surface shadow-sm p-5`; bands
  `.band-dots / -tint / -dark / -plain`; `.hero-gradient` with `.hero-photo` (+ `-tint`, `-scrim`);
  `.portal-sidebar`; `.marquee`; `SectionHeading` with numbered mono eyebrow; status via
  `StatusBadge` (pill). `--sticky-top` CSS var tells sticky bars where the layout header ends.
- **Phones**: everything must fit 390 px with no horizontal scroll; tap targets ≥44 px under 640 px;
  tables become cards (`StackTable`). Motion respects `prefers-reduced-motion`.
- Visitor-facing copy: plain English, short, no jargon without explanation, **"carrier" not
  "client"**, the name with spaces.

---

## 12. Working rules (must follow)

These come from the owner; breaking them has caused real problems before.

1. **Ask before every push.** Show what changed (with screenshots for UI), ask "Shall I push?", wait
   for an explicit yes. An approval covers only what was shown; anything changed afterwards needs a
   new yes. Stage explicit files only.
2. **Never send real email from tests, demos or scripts.** `backend/.env` holds live Gmail
   credentials; a test once flooded the owner's inbox. Keep `tests/conftest.py`'s email blanking and
   `test_no_real_email.py`; demo launchers blank `GMAIL_*`, `SMTP_HOST`, `RESEND_API_KEY`; pass fake
   senders. If emails start arriving, stop the run first.
3. **Safety Score Report accuracy.** Carriers read it. Never add or change a statement without
   checking the code rule that produces it and a real carrier on FMCSA's public pages (SAFER
   snapshot, SMS `ai.fmcsa.dot.gov/SMS/Carrier/<usdot>/CompleteProfile.aspx`). Prefer saying less.
   Print a real PDF (busy carrier USDOT 2814323, quiet 4104733) before asking to push.
4. **No invented facts anywhere**: no fake stats, testimonials, customers, alerts or features.
   Estimates are labelled as estimates. Regulations quoted must be verified (cite the CFR section).
5. **Don't run the 20-carrier report check** after every change; only when asked.
6. **Secrets** never in git, logs or chat. Partner keys, Stripe, Turnstile, Gmail, Google all live in
   `backend/.env` / Render / Vercel.
7. **Live database is read-only** for investigation. Use the local test DB for anything else.
8. **Don't touch ports 8000 / 5173** (owner's servers). Use 8011 / 5197.
9. **Never commit** `frontend/src/features/carrier-profile/IdentitySection.tsx` or
   `frontend/src/types/carrierProfile.ts` unless the owner explicitly says so (they may carry local
   edits).
10. **Never build anything that stores or relays carriers' FMCSA passwords** (the credentials
    feature was removed on purpose).
11. **Public pages**: no data-source wording; no price (until pricing is decided); "carrier" not
    "client"; name as "Carrier Safety Scan"; the front door stores nothing (no cookies).
12. **Legal text** (Terms/Privacy) is kept word-for-word as provided for now (see §14).
13. **Photos**: real photos only (the owner rejected AI-generated images as looking fake); licensed
    sources; no readable company names or plates.
14. Communicate with the owner in short, plain English; when a request is ambiguous, say which way
    you went. The owner often sends screenshots with red circles: they mean "change this".

---

## 13. What has been done: history

323 commits, 2026-10-08 → 2026-11-04.

- **Oct 8–9 — MVP (phases 1–11)**: foundation (React → FastAPI → Postgres on Supabase), carrier data
  model, FMCSA ingestion (census, inspections, violations, authority & insurance from Motus and
  legacy L&I, BOC-3), search and profile, Safety tab, Authority & Insurance tab and timeline, VINs
  + NHTSA decode + Equipment tab, intelligence engine and UI (signals, evidence, review), Postgres job
  queue + worker + scheduler, Network & Identity tab (shared contacts, registration health),
  estimated insurance renewal, OOS rates by FMCSA's method, one-page packet (PDF), CSA BASICs and
  crashes, source labels everywhere, "how to improve".
- **Oct 13–16 — portals & accounts**: client and internal portals, Google sign-in, broker sign-up and
  portal, landing page, **Estimated ISS v1 → v2.1** with history, demo deploy (Vercel + Render free,
  no worker), deploy check, client home "your carrier right now", **Compare** (up to 3, verdicts,
  "how we decide").
- **Oct 19–20** — renamed to CarrierSafetyScan, colour system, three-page scorecard, Chameleon check
  (EIN via QCMobile), weigh-station pull-in by state, client search turned off.
- **Oct 21–23 — DataQs** phases 0–6 (cases, intake wizard, evidence, staff queue, filing console,
  correspondence/appeals/clocks, emails via Gmail API, supervisor view, reminders, verification).
- **Oct 26–28** — DataQs refinements (login-code options, booking calls, proof of filing, agent
  authorization), **Compliance tab** + service requests, own **invoices** via Stripe, High ISS list,
  $50 DataQs fee, subscription + trial, welcome emails.
- **Oct 29–30** — Packet renamed **Safety Score Report** (A4 pages, SMS detail, solutions), new
  logo, phones/tablets everywhere, bot protection (Turnstile, rate limits, honeypot), password reset,
  email confirmation, trial = 30 days, price $49, **Try Now**, Contact page, **insurance agent
  accounts**, new colour themes.
- **Nov 2–3** — report accuracy fixes, plain-English pass, History tab, 44 px tap targets, claim your
  company (one account per USDOT), **Partner API**, cancel at period end, **Terms/Privacy at
  sign-up**, report reworked (score + history on page 1, red items with fixes first, every
  inspection listed), officer names no longer link carriers.
- **Nov 4 — this session's big UI work**:
  - Report: plain black headings, no icons/side notes, 92% size (min 13 px), no section starting
    with <3 rows, red out-of-service labels.
  - **Front door** (choose carrier / broker / agent; nothing stored), audience pages, public pages
    without data-source wording, name with spaces everywhere, deploy check updated.
  - Landing: varied section bands, numbered headings, fuller header (announcement bar, menu,
    Schedule a demo), real photos, scrolling checks strip, self-hosted fonts, dark-mode fixes,
    portal tour pages, Google sign-in for insurance agents (backend + page + tests), hero photos
    visible, hero pills removed, price removed from public pages, **hero tools** per audience
    (MCS-150, booking check, liability minimums), front door photo cards with the licensed iStock
    carrier photo.
  - **Portal redesign**: `PortalShell` navy sidebar for carrier and broker/agent portals, carrier
    page header (ISS ring, pills, sticky tabs), rounder cards; carrier home action center; broker
    home; new insurance agent home; Compare restyled (no verdicts for agents); docket formatting
    bug fixed.

`CHECKPOINT.md` has the detailed phase log and a session log; add to it at the end of a session.

---

## 14. Open items and pending decisions

Ask the owner before acting on any of these.

1. **MCS-150 due date in the backend** — `backend/app/services/registration_health.py` says "due by"
   = last filing + 24 months, but 49 CFR 390.19 fixes the month by USDOT digits (as the hero tool
   and the carrier action center do). This feeds the broker-check flags and the Safety Score
   Report. Proposed: research FMCSA's exact rule (including whether an off-schedule update resets
   it) and align, as its own change. **Awaiting the owner's yes.**
2. **Price** — not final. Removed from public pages; still shown in the portal trial banner /
   pop-up ("Then $49 a month", from the server) — owner hasn't decided whether to hide it. The
   memory note about Stripe once said $25; the code is $49 (`MONTHLY_PRICE`).
3. **Compare page line** "the Supreme Court's 2026 Montgomery case turned on one" (conditional
   rating, `features/compare/VerdictPanels.tsx`) — unverified; owner to decide keep / verify / drop.
4. **Legal documents** (`features/legal/legalText.ts`): Privacy Policy §7 last sentence wrongly says
   the app *has* analytics trackers (none exist; contradicts §17); neither document has an effective
   date; the Privacy Policy has no public footer link. When they change: regenerate `legalText.ts`
   from the new `.docx` and bump `TERMS_VERSION` in `backend/app/schemas/auth.py`.
5. **Email overrides** — `DATAQS_EMAIL_CARRIER_OVERRIDE` / `DATAQS_EMAIL_STAFF_OVERRIDE` send every
   customer/staff email (including sign-up confirmation and password reset) to internal test
   inboxes. Real customers can't confirm a password sign-up or reset a password until they're
   removed (Render env + `render.yaml`). Remind the owner at launch; never remove without a yes.
6. **iStock photo** — the front-door carrier card uses the 612 px preview; get the full-size
   licensed file for sharpness.
7. **Staff portal** still uses the old top-bar `AppLayout`; moving it into `PortalShell` was the
   planned next step of the redesign.
8. **"Recently viewed carriers"** for brokers would need `CarrierProfilePage` to record views
   (suggested by the redesign agent; not built).
9. Housekeeping from `CHECKPOINT.md`: reset the Supabase DB password (it was once shared in chat);
   rename the app on Google's OAuth consent screen; remove the old carrier-iq.vercel.app redirect URI
   when unused.
10. Small code notes: stale docstrings (migration 0045 says 14-day/$25; `PacketDocument` says "three
    pages"; `DataQsIntro` says "phase 0"; router header comment misses newer routes);
    `.env.example` lacks Stripe/Google/Turnstile/`AUTH_SECRET_KEY`/`ENVIRONMENT`/partner/schedule
    link vars; `render.yaml` doesn't declare Stripe/partner/schedule/CORS vars (set by hand);
    `vercel.json` sets no security headers; rate limits are in-memory (per process); 2 pre-existing
    mypy errors in auth; drug & alcohol and background check have no online price (request-only);
    CPDP crash preventability marked "later release"; uploads exclude ZIP/ETHOS until scanning.

---

## 15. Launch checklist (official domain)

When the purchased domain goes live:

1. Run a **real background worker** (Render `RUN_WORKER_IN_API=true` or a separate worker service on
   a paid plan) so Refresh now, scheduled refreshes and the monthly ISS build run.
2. Turn the worker banner back on: `VITE_SHOW_WORKER_ALERT=true` on Vercel (also brings back the
   dashboard Background jobs card).
3. "Put all this in the database": let scheduled ingestion keep carrier data current; lower
   `CARRIER_REFRESH_HOURS` (now 876000, i.e. never) to e.g. 24.
4. Google: set `GOOGLE_REDIRECT_URI` to `https://<domain>/api/v1/auth/google/callback` and add it to
   the OAuth client. Update `CORS_ORIGINS`, `PUBLIC_APP_URL`, and the `vercel.json` rewrite if the API
   host changes.
5. Turnstile: add the domain to the widget hostnames; keys on the host.
6. **Remove the email overrides** (§14.5) — with the owner's yes.
7. Stripe **live mode**: webhook endpoint (6 events: `checkout.session.completed`,
   `charge.refunded`, `customer.subscription.created/updated/deleted`, `invoice.paid`) + its secret
   on Render; live customer portal (invoice history, card update, cancel at period end, no plan
   switching); owner disables Link.
8. If Cloudflare proxies the whole site: check `client_ip` in `api/bot_protection.py` (first
   X-Forwarded-For entry) still sees real visitor IPs, otherwise everyone shares one rate limit.

---

## 16. Gotchas and quirks

- **Windows + Git Bash**: use `MSYS_NO_PATHCONV=1` when passing `/paths` as arguments (scripts,
  Stripe CLI). Many source files have CRLF endings — when editing with scripts, detect and keep the
  file's line endings. Python heredocs mangle backslashes (a regex lost its `\s`/`\d` once and
  silently broke docket formatting) — write patch files or check the result.
- The login endpoint is **rate-limited**; screenshot scripts should log in once per run.
- Turnstile is on in `backend/.env`; local API logins without a token get 400 — the demo launcher
  blanks the Turnstile keys.
- A free Render cold start can take ~1 minute; a `fetch failed` in a script often means you stopped
  a server mid-run.
- Vercel/Render only deploy what changed; a docs-only or workflow-only commit deploys nothing.
- The dark theme inverts slate colours (§11) — the most common source of "invisible text" bugs.
- `getBoundingClientRect` returns zoomed sizes: the report applies zoom before measuring (printFit).
- Headless Edge in a background tab can freeze `motion` reveal animations; screenshot scripts bring
  the page to front / scroll the page first.
- Compare list lives in **sessionStorage** per portal; theme in localStorage; the front door stores
  nothing.

---

## 17. Reference: environment variables

Names only — values live in `backend/.env`, Render and Vercel. Full list in
`backend/app/core/config.py`.

- General: `APP_NAME`, `ENVIRONMENT`, `LOG_LEVEL`, `DATABASE_URL`, `CORS_ORIGINS`,
  `PUBLIC_APP_URL`, `PUBLIC_API_URL`.
- Socrata: `SOCRATA_BASE_URL`, `SOCRATA_APP_TOKEN`, `SOCRATA_TIMEOUT_SECONDS`, `SOCRATA_PAGE_SIZE`,
  `SOCRATA_MAX_ATTEMPTS`, `SOCRATA_RETRY_BASE_SECONDS`, all `*_DATASET_ID`, `LEGACY_LI_FROZEN_ON`.
- Freshness & limits: `CARRIER_REFRESH_HOURS`, `SIGNAL_LOOKBACK_DAYS`, `CONTACT_LINK_LIMIT`,
  `SEARCH_RESULT_LIMIT`, `DOCKET_SEARCH_LIMIT`.
- Worker: `RUN_WORKER_IN_API`, `WORKER_POLL_SECONDS`, `WORKER_HEARTBEAT_SECONDS`, `JOB_MAX_ATTEMPTS`,
  `JOB_RETRY_BASE_SECONDS`, `JOB_LOCK_TIMEOUT_MINUTES`, `SCHEDULER_ENABLED`,
  `SCHEDULE_INTERVAL_MINUTES`, `SCHEDULE_BATCH_SIZE`, `SCHEDULE_FAILED_COOLDOWN_HOURS`.
- vPIC: `VPIC_BASE_URL`, `VPIC_BATCH_SIZE`, `VPIC_PARALLEL_REQUESTS`, `VPIC_TIMEOUT_SECONDS`.
  QCMobile: `QCMOBILE_BASE_URL`, `QCMOBILE_WEB_KEY`, `QCMOBILE_TIMEOUT_SECONDS`,
  `QCMOBILE_PARALLEL_REQUESTS`.
- Auth: `AUTH_SECRET_KEY`, `AUTH_TOKEN_HOURS`, `AUTH_COOKIE_NAME`, `AUTH_MIN_PASSWORD_LENGTH`,
  `PARTNER_API_KEY_HASHES`, `CLIENT_SEARCH_ENABLED`, `EMAIL_VERIFICATION_REQUIRED`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TURNSTILE_SITE_KEY`,
  `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_ENABLED`.
- DataQs: `DATAQS_STORAGE_ENDPOINT`, `DATAQS_STORAGE_REGION`, `DATAQS_STORAGE_ACCESS_KEY_ID`,
  `DATAQS_STORAGE_SECRET_ACCESS_KEY`, `DATAQS_STORAGE_BUCKET`, `DATAQS_MAX_UPLOAD_MB`,
  `DATAQS_INTERNAL_CUTOFF_DAYS`, `DATAQS_REPRESENTATIVE_COMPANY/EMAIL/PHONE`,
  `DATAQS_REMINDER_DAYS`, `DATAQS_EMAIL_DISPATCH_IN_API`, `DATAQS_VERIFICATION_IN_API`,
  `DATAQS_VERIFICATION_CHECK_HOURS`, `DATAQS_VERIFICATION_ESCALATE_DAYS`, `DATAQS_OTP_WIPE_IN_API`,
  `STS_SCHEDULE_LINK_URL`, `STS_SCHEDULE_LINK_TOKEN`.
- Email: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_SECURITY`, `RESEND_API_KEY`, `DATAQS_EMAIL_FROM`,
  `DATAQS_EMAIL_REPLY_TO`, `DATAQS_EMAIL_CARRIER_OVERRIDE`, `DATAQS_EMAIL_STAFF_OVERRIDE`,
  `COMPLIANCE_REQUEST_EMAIL`.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Twilio: `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- Frontend: `VITE_SHOW_WORKER_ALERT` (Vercel), `API_PROXY_TARGET` (Vite dev proxy).

---

## 18. Reference: routes

**Frontend** (`frontend/src/router.tsx`):

- Public: `/`, `/for-carriers`, `/for-brokers`, `/for-insurance-agents`, `/for-…/portal`,
  `/contact`, `/methodology`, `/c/:usdot`, `/try`, `/try/:usdot`, login/register pages (§10.1),
  `*` 404.
- Carrier: `/portal`, `/portal/dataqs`, `/portal/dataqs/new`, `/portal/dataqs/cases/:id`,
  `/portal/search` (only with client search), `/portal/carriers/:usdot`, `/portal/invoices/:id`.
- Broker/agent: `/broker`, `/broker/compare`, `/broker/carriers/:usdot`, `/broker/invoices`,
  `/broker/invoices/:id`.
- Staff: `/dashboard`, `/search`, `/compare`, `/carriers/:usdot`, `/dataqs`, `/dataqs/new`,
  `/dataqs/cases/:id`, `/accounts`, `/service-requests`, `/invoices`, `/invoices/:id`, `/high-iss`.

**API** (`/api/v1`): `health`; `auth` (register ×3, login, logout, me, email verify/resend,
password forgot/reset, options, Google start/callback/signup ×3); `try` (find, start, carrier tabs);
`contact`; `partner/iss/{usdot}`; staff `carriers` (search, profile, tabs, refresh, identity
events), `signals`, `jobs`, `dashboard`, `iss/high(.xlsx)`; `admin` (users, seen, disable,
reactivate, link carrier, release claim); `portal` (overview, search, own carrier tabs); `broker`
(overview, search, carrier tabs, chameleon); `dataqs` + `portal/dataqs` (cases, evidence, OTP,
fee, approvals, packages, filing, correspondence, clocks, verification, supervisor, audit CSV);
`compliance` (UCR, requests, prices, checkout, handled); `invoices` (list, one, pdf, pay, void);
`billing` (state, subscribe, cancel, resume, manage); `webhooks/stripe`, `webhooks/twilio/*`.
