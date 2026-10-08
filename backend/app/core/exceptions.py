"""Domain exceptions and their single mapping to HTTP responses."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class CarrierIQError(Exception):
    """Base class for all application errors."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(CarrierIQError):
    status_code = 404
    code = "not_found"


class CarrierNotFoundError(NotFoundError):
    code = "carrier_not_found"


class ValidationError(CarrierIQError):
    status_code = 422
    code = "validation_error"


class SourceFetchError(CarrierIQError):
    """An external data source (data.transportation.gov, NHTSA, ...) failed or returned bad data."""

    status_code = 502
    code = "source_fetch_error"


class DatabaseUnavailableError(CarrierIQError):
    status_code = 503
    code = "database_unavailable"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(CarrierIQError)
    async def handle_carrieriq_error(_: Request, exc: CarrierIQError) -> JSONResponse:
        log = logger.error if exc.status_code >= 500 else logger.info
        log("%s: %s", exc.code, exc.message)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )
