"""Application factory. Wiring only; no business logic here."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.middleware import request_id_middleware
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title=settings.app_name, version="0.1.0")

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
