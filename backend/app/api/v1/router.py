"""Collects every v1 route module. Add one include_router line per new resource."""

from fastapi import APIRouter

from app.api.v1.routes import carriers, dashboard, health, jobs, signals

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(carriers.router)
api_router.include_router(signals.router)
api_router.include_router(jobs.router)
api_router.include_router(dashboard.router)
