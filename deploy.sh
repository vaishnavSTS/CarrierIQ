#!/bin/sh
# Deploy on the production VM: pull the latest code, build the website, then build and restart
# the database, API and worker in Docker. Run it from the repo folder (on the VM: ~/CarrierSafetyScan):
#
#   ./deploy.sh
#
# Needs, created by hand (never in git): backend/.env (from .env.example) and
# frontend/.env.production (VITE_SHOW_WORKER_ALERT=true, VITE_SITE_URL=https://<domain>).
# First run: Docker downloads PostgreSQL, creates the database, and the backend creates every
# table (alembic upgrade head). Later runs apply only new migrations; the data stays (pgdata).
#
# The same compose command for everyday use (logs, restarts):
#   alias dc='docker compose -f ~/CarrierSafetyScan/docker-compose.yml \
#     -f ~/CarrierSafetyScan/docker-compose.localdb.yml -f ~/CarrierSafetyScan/docker-compose.vm.yml \
#     --env-file ~/CarrierSafetyScan/backend/.env --profile localdb'
# Always name the services (db backend worker): the `frontend` service is the development
# server and isn't used on the VM.
set -eu
cd "$(dirname "$0")"

[ -f backend/.env ] || { echo "Missing backend/.env (copy .env.example and fill it in)"; exit 1; }
[ -f frontend/.env.production ] || { echo "Missing frontend/.env.production"; exit 1; }

git pull --ff-only

# Build the website in a throwaway Node container (no Node needed on the VM), as this user so
# the built files aren't owned by root. Nginx serves frontend/dist, so it's live once built.
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD/frontend:/app" -w /app node:22-alpine sh -c "npm ci && npm run build"

docker compose -f docker-compose.yml -f docker-compose.localdb.yml -f docker-compose.vm.yml \
  --env-file backend/.env --profile localdb up -d --build db backend worker

docker image prune -f
echo "Deployed $(git log --oneline -1)"
