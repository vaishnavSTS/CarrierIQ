# CarrierIQ — Carrier Intelligence Platform

Explainable carrier intelligence for freight brokers. The product specification is in
`../PROJECT_SPECIFICATION.md` and is the source of truth for scope and design.

Current state: **Phase 5 — safety** complete (carrier search, profile, and a safety view with
inspection trends, violations and history, loaded from FMCSA on demand). Progress is tracked in `CHECKPOINT.md`.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router |
| Backend | Python, FastAPI, Pydantic, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL 16 (psycopg 3 driver) |

## Run everything with Docker

Requires Docker Desktop.

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- API health: http://localhost:8000/api/v1/health
- API docs: http://localhost:8000/docs

Migrations run automatically when the backend container starts.

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
npm run lint
npm run build
```

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
  workers/              background processing (Phase 10)
```

Requests flow route → service → repository. Each module logs under its own name, and every
log line includes the request ID (also returned in the `X-Request-ID` header), so a failure can
be traced to the exact file and request.
