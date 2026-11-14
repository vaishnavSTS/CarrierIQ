# CarrierSafetyScan — Carrier Intelligence Platform

## Live app

**Open CarrierSafetyScan: https://carriersafetyscan.com** (the STS team, carriers, freight
brokers and insurance agents all log in here).

Everything runs on STS's own Ubuntu VM in the office: the website, the API, the background worker,
PostgreSQL and the DataQs evidence files (see **Deploy** below). Vercel, Render and Supabase are no
longer used.

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
cp .env.example backend/.env       # then fill it in (see the comments in the file)
docker compose -f docker-compose.yml -f docker-compose.localdb.yml --profile localdb up --build
```

- Frontend: http://localhost:5173
- API health: http://localhost:8000/api/v1/health
- API docs: http://localhost:8000/docs

Migrations run automatically when the backend container starts; the frontend and worker wait
until the backend is healthy. Jobs run in the worker container (`RUN_WORKER_IN_API` is off in
Docker). Stop local `uvicorn` / `npm run dev` first: they use the same ports.

## Deploy: the office VM

```
Browser ──► https://carriersafetyscan.com ──► office proxy (Nginx Proxy Manager, HTTPS)
        ──► VM Nginx :80 ──► website (frontend/dist)
                         └─► /api/ ──► backend (Docker, 127.0.0.1:8000) ──► PostgreSQL (Docker)
                                       worker (Docker) ───────────────────┘
```

- The office proxy holds the HTTPS certificate (Let's Encrypt, renewed by Nginx Proxy Manager)
  and passes every request to the VM on port 80.
- Nginx on the VM serves the built website and passes `/api/` to the backend. It trusts the
  visitor's address (`X-Real-IP`) and `X-Forwarded-Proto` only from the office proxy.
- The backend, worker and database run in Docker from `docker-compose.yml`,
  `docker-compose.localdb.yml` and `docker-compose.vm.yml` together. The database and the API are
  never reachable from the network: only Nginx on the VM reaches the API.
- DataQs evidence files are in `/srv/carrieriq/dataqs` on the VM (`DATAQS_STORAGE_DIR=/data/dataqs`).

**Deploying a change:** push to `main`, then on the VM run `./deploy.sh` in the repo folder. It
pulls, builds the website, rebuilds and restarts the database, backend and worker, and applies
new migrations. Nothing deploys by itself on a push.

The VM's settings are in `backend/.env` and `frontend/.env.production` on the VM (never in git);
`.env.example` lists every setting with what it turns on.

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
