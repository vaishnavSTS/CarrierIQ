"""Collects every v1 route module. Add one include_router line per new resource.

Access: health and auth are public; carrier data, signals, jobs and the dashboard are the
internal portal (STS staff only); admin and the client / broker portals check their own roles
per route.
"""

from fastapi import APIRouter, Depends

from app.api.auth import require_staff
from app.api.v1.routes import admin, auth, carriers, dashboard, health, jobs, portal, signals

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)

staff_only = [Depends(require_staff)]
api_router.include_router(carriers.router, dependencies=staff_only)
api_router.include_router(signals.router, dependencies=staff_only)
api_router.include_router(jobs.router, dependencies=staff_only)
api_router.include_router(dashboard.router, dependencies=staff_only)

api_router.include_router(admin.router)
api_router.include_router(portal.router)
api_router.include_router(portal.broker_router)
