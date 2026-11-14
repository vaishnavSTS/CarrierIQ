"""Application factory. Wiring only; no business logic here."""

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.api.middleware import request_id_middleware
from app.api.v1.router import api_router
from app.core.config import DEV_AUTH_SECRET_KEY, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging
from app.services.dataqs_notifications import run_dispatcher, wake_dispatcher
from app.services.dataqs_otp_service import run_otp_wiper
from app.services.dataqs_verification_service import run_verifier
from app.workers.worker import Worker

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """DataQs emails are sent from a thread of the API process once email is set up, and approved
    corrections are checked against FMCSA's data from another (DATAQS_VERIFICATION_IN_API)."""
    settings = get_settings()
    stop = threading.Event()
    dispatcher = None
    if settings.dataqs_email_enabled and settings.dataqs_email_dispatch_in_api:
        dispatcher = threading.Thread(
            target=run_dispatcher, args=(stop,), name="dataqs-email", daemon=True
        )
        dispatcher.start()
        logger.info("DataQs email dispatcher started")
    otp_wiper = None
    if settings.twilio_enabled and settings.dataqs_otp_wipe_in_api:
        otp_wiper = threading.Thread(
            target=run_otp_wiper, args=(stop,), name="dataqs-otp-wipe", daemon=True
        )
        otp_wiper.start()
    verifier = None
    if settings.dataqs_verification_in_api:
        verifier = threading.Thread(
            target=run_verifier, args=(stop,), name="dataqs-verification", daemon=True
        )
        verifier.start()
        logger.info("DataQs correction checks started")
    try:
        async with worker_lifespan(app):
            yield
    finally:
        stop.set()
        if dispatcher is not None:
            wake_dispatcher()  # stop waiting now
            dispatcher.join(timeout=10)
        if verifier is not None:
            verifier.join(timeout=10)
        if otp_wiper is not None:
            otp_wiper.join(timeout=10)


@asynccontextmanager
async def worker_lifespan(_: FastAPI) -> AsyncIterator[None]:
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


REDIRECT_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]


def create_redirect_app(target: str) -> FastAPI:
    """REDIRECT_TO is set: this copy is retired. Every request goes to the same path and query on
    `target` with a 308, so the method and body are kept (partner API calls, webhooks that follow
    redirects). The health check still answers here, so the host keeps the service up. No
    database, no email dispatcher, no background jobs: the live copy does all of that."""
    target = target.rstrip("/")
    app = FastAPI(title="Carrier Safety Scan (moved)", docs_url=None, redoc_url=None)

    @app.get("/api/v1/health", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "moved", "location": target}

    @app.api_route("/{path:path}", methods=REDIRECT_METHODS, include_in_schema=False)
    def moved(path: str, request: Request) -> RedirectResponse:
        query = request.url.query
        return RedirectResponse(f"{target}/{path}{'?' + query if query else ''}", status_code=308)

    return app


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    if settings.redirect_to:
        logger.info("REDIRECT_TO is set: redirecting every request to %s", settings.redirect_to)
        return create_redirect_app(settings.redirect_to)
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
