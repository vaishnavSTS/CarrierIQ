"""Application factory. Wiring only; no business logic here."""

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.middleware import request_id_middleware
from app.api.v1.router import api_router
from app.core.config import DEV_AUTH_SECRET_KEY, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.workers.worker import Worker

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """With RUN_WORKER_IN_API=true (local development) the background worker runs in a thread of
    the API process, so starting the backend also starts the worker; it stops with the API."""
    if not get_settings().run_worker_in_api:
        yield
        return
    stop = threading.Event()
    thread = threading.Thread(
        target=Worker().run_forever, args=(stop,), name="carriersafetyscan-worker", daemon=True
    )
    thread.start()
    logger.info("Background worker started inside the API (RUN_WORKER_IN_API=true)")
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=30)  # lets a running job finish; a job cut off is requeued


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    if settings.environment != "local" and settings.auth_secret_key == DEV_AUTH_SECRET_KEY:
        raise RuntimeError("Set AUTH_SECRET_KEY to a long random value outside local development")

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    app.middleware("http")(request_id_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
