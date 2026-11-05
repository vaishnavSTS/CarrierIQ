# CarrierSafetyScan — Carrier Intelligence Platform

## Live app

**Open CarrierSafetyScan: https://carriersafetyscan.vercel.app** (the STS team, carriers, freight
brokers and insurance agents all log in here).
The old address https://carrier-iq.vercel.app still opens the app, but Google sign-in works only on
the new one (Render's `GOOGLE_REDIRECT_URI` points there).

[![Frontend (Vercel)](https://img.shields.io/github/deployments/vaishnavSTS/CarrierIQ/Production?label=frontend%20%28Vercel%29&logo=vercel)](https://github.com/vaishnavSTS/CarrierIQ/deployments/Production)
[![Backend (Render)](https://img.shields.io/github/deployments/vaishnavSTS/CarrierIQ/main%20-%20carrieriq-api?label=backend%20%28Render%29&logo=render)](https://github.com/vaishnavSTS/CarrierIQ/deployments)
[![Deploy check](https://github.com/vaishnavSTS/CarrierIQ/actions/workflows/deploy-check.yml/badge.svg)](https://github.com/vaishnavSTS/CarrierIQ/actions/workflows/deploy-check.yml)

Each badge shows the result of that service's latest deploy: **success** means it is live,
**pending** or **in progress** means it is building, **failure** or **error** means the last deploy
failed and the previous version is still running. **Deploy check** (served by GitHub itself)
shows whether the live app and backend answered after the latest deploy; the other two come from
shields.io, which sometimes shows "Unable to select next GitHub token from pool" when it is busy:
that is a badge-service limit, not a deploy problem, and clears on a later refresh. A push redeploys only what it changed:
`frontend/` on Vercel, `backend/` on Render. The free backend sleeps when idle, so the first
page after a quiet spell can take about a minute.

Explainable carrier intelligence, built by Sky Transport Solutions (STS), for three audiences:

- **Carriers**: their own record the way a broker's check sees it, the Estimated ISS, what to
  fix, DataQs challenges handled by STS, and the Safety Score Report.
- **Freight brokers**: a booking check on any carrier, linked carriers and the Chameleon check,
  Compare up to 3, and the carrier map (by state and county, with each carrier's contact card
  and a Hazmat list).
- **Insurance agents**: filings, safety record, crashes and fleet by VIN for underwriting, in the
  broker portal with the same carrier map.

The public site has a page for each audience, a free one-carrier search, the carrier map (first 10
carriers a list), "How the score works" and a Sources page (linked from the footer) listing every
outside source the app reads: FMCSA (QCMobile, SAFER, SMS, DataQs, Motus), the
data.transportation.gov datasets, NHTSA vPIC and the PrePass pull-in rates.

The product specification is in `../PROJECT_SPECIFICATION.md` and is the source of truth for scope
and design. Current state: all 10 MVP phases and Phase 11 (Network & Identity) are done, and the
work since then (portals, DataQs, Safety Score Report, billing, carrier map) is in the session log
of `CHECKPOINT.md`.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router |
| Backend | Python, FastAPI, Pydantic, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL 16 (psycopg 3 driver) |

## Run everything with Docker

Requires Docker Desktop. The backend and worker containers read `backend/.env` (the same file
local runs use: database, Socrata token, Google sign-in); start from `.env.example`.

```bash
cp .env.example backend/.env       # then fill in DATABASE_URL (Supabase) etc.
docker compose up --build          # backend, worker, frontend on Supabase
```

- Frontend: http://localhost:5173
- API health: http://localhost:8000/api/v1/health
- API docs: http://localhost:8000/docs

Migrations run automatically when the backend container starts; the frontend and worker wait
until the backend is healthy. Jobs run in the worker container (`RUN_WORKER_IN_API` is off in
Docker). Stop local `uvicorn` / `npm run dev` first: they use the same ports.

To use the local PostgreSQL container instead of Supabase:

```bash
docker compose -f docker-compose.yml -f docker-compose.localdb.yml --profile localdb up --build
```

## Deploy (demo): Vercel frontend, Render backend, Supabase database

```
Browser ──► Vercel (frontend) ── /api/* rewrite ──► Render (backend) ──► Supabase
```

The browser only talks to the Vercel domain: `frontend/vercel.json` passes `/api/*` to the Render
service, so the login cookie and Google sign-in work exactly as they do locally through Vite.

**Demo setup, no background worker.** Searching a carrier that is not in the database still loads
it live from FMCSA (seconds for most carriers; very large fleets take minutes, so open those
locally first: local and hosted use the same Supabase database). `CARRIER_REFRESH_HOURS` in
`render.yaml` keeps stored carriers as they are. Without a worker, "Refresh now" stays queued, the
monthly Estimated ISS reference is not rebuilt, and older carriers are not refreshed overnight.

1. **Render (backend).** New → Blueprint → this repository; it reads `render.yaml` (free plan,
   Docker, `backend/`). `AUTH_SECRET_KEY` is generated by Render. In the service's Environment,
   set the values marked `sync: false` in `render.yaml` (each is explained there). Every feature
   whose keys are missing stays off; the app still starts.

   | Setting | What it turns on |
   |---|---|
   | `DATABASE_URL` | Supabase session-pooler URL, as in `backend/.env` (required) |
   | `SOCRATA_APP_TOKEN` | data.transportation.gov (FMCSA datasets, carrier map) |
   | `QCMOBILE_WEB_KEY` | FMCSA QCMobile: carriers' EIN for the Chameleon check |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google sign-in (step 3) |
   | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile on login and sign-up |
   | `GMAIL_*`, or `SMTP_*`, or `RESEND_API_KEY`; `DATAQS_EMAIL_FROM` | Email (Gmail API first, as the free plan blocks SMTP) |
   | `DATAQS_EMAIL_CARRIER_OVERRIDE`, `DATAQS_EMAIL_STAFF_OVERRIDE` | Testing only: send every email to these inboxes. Delete both before real customers sign up |
   | `DATAQS_STORAGE_*` | DataQs evidence files (Supabase Storage, S3 API) |
   | `TWILIO_*` | FMCSA login codes by text or call |
   | `PUBLIC_APP_URL`, `PUBLIC_API_URL` | Links in emails; Twilio and Stripe webhooks |
   | `COMPLIANCE_REQUEST_EMAIL` | Where Compliance-tab service requests are emailed |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe payments (not in `render.yaml`: add them in the dashboard; webhook at `PUBLIC_API_URL/api/v1/webhooks/stripe`) |

   Deploy, then check `https://<service>.onrender.com/api/v1/health`. The free plan sleeps after
   about 15 idle minutes; the first request after that takes about a minute.
2. **Vercel (frontend).** New Project → this repository, Root Directory `frontend` (Vite is
   detected). If the Render URL is not `https://carrieriq-api.onrender.com`, change it in
   `frontend/vercel.json` first.
   Every push to `main` redeploys both: Vercel and Render each build from GitHub on their own
   servers (not GitHub Actions). Render applies database migrations on start.
   **Client search:** `CLIENT_SEARCH_ENABLED` is `false` (the default, and in `render.yaml`), so
   clients see only their own carriers, with no search. To let clients search and open any
   carrier again (e.g. for team testing), set it to `true` in Render → carrieriq-api →
   Environment (Save and deploy). No code change is needed.
3. **Google sign-in.** Set `GOOGLE_REDIRECT_URI` on Render to
   `https://<vercel-domain>/api/v1/auth/google/callback` and add the same URL to the OAuth client's
   Authorized redirect URIs in Google Cloud Console.

## Run locally without Docker

You still need a PostgreSQL 16 server (for example `docker compose up db`, or a local install).

### Backend (inside the project's own virtual environment)

```bash
cd backend
python -m venv .venv
# Windows (PowerShell):  .venv\Scripts\Activate.ps1
# macOS/Linux:           source .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example .env          # adjust DATABASE_URL if needed
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite forwards `/api` requests to `http://localhost:8000` (override with `API_PROXY_TARGET`).

## Quality checks

```bash
# backend (venv active)
pytest                           # database tests skip unless TEST_DATABASE_URL is set
ruff check . && ruff format --check .
mypy app

# frontend
npx prettier --check src
npm run lint
npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) can run the same checks, plus `alembic upgrade head`
on an empty PostgreSQL and the database tests. It runs only when started by hand (Actions → CI →
Run workflow), never on push.

The **Deploy check** workflow (`.github/workflows/deploy-check.yml`) is the one that runs on its
own: only when Vercel or Render reports a finished deploy. Each run appears in the Actions tab as
"Frontend (Vercel) deploy success: <commit>" or "Backend (Render) …" and checks that the live app
and backend answer. Run workflow on it checks both by hand.

### Database tests

Model tests run against a real PostgreSQL inside a throwaway `pytest_models` schema and roll
back every test, so they never touch application tables. Use the local container:

```bash
docker compose --profile localdb up -d db
# PowerShell: $env:TEST_DATABASE_URL="postgresql+psycopg://carrieriq:carrieriq@localhost:5432/carrieriq"
TEST_DATABASE_URL=postgresql+psycopg://carrieriq:carrieriq@localhost:5432/carrieriq pytest
```

## Backend layout

```text
app/
  main.py               app factory (wiring only)
  core/                 config, logging (request IDs), exceptions
  db/                   engine/session, declarative base
  api/v1/routes/        one router per resource
  services/             business logic, one per domain
  repositories/         database queries, one per entity
  schemas/              Pydantic request/response models
  models/               ORM models, one per table; enums.py and mixins.py hold shared pieces
  ingestion/            source adapters (Phase 3)
  intelligence/rules/   one file per signal rule (Phase 8)
  jobs/                 background jobs: queue (PostgreSQL), scheduler, handlers
  workers/              the worker process and one-off admin scripts (Phase 10)
```

Requests flow route → service → repository. Each module logs under its own name, and every
log line includes the request ID (also returned in the `X-Request-ID` header), so a failure can
be traced to the exact file and request.
