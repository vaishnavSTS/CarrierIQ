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


class UnauthorizedError(CarrierIQError):
    """Not logged in, or the session has expired."""

    status_code = 401
    code = "not_authenticated"


class ForbiddenError(CarrierIQError):
    """Logged in, but this user may not do this (wrong portal, pending or disabled account)."""

    status_code = 403
    code = "forbidden"


class AccountPendingError(ForbiddenError):
    code = "account_pending"


class AccountDisabledError(ForbiddenError):
    code = "account_disabled"


class ConflictError(CarrierIQError):
    status_code = 409
    code = "conflict"


class SourceFetchError(CarrierIQError):
    """An external data source (data.transportation.gov, NHTSA, ...) failed or returned bad data."""

    status_code = 502
    code = "source_fetch_error"


class SourceDataError(CarrierIQError):
    """A source record was fetched but cannot be normalized (e.g. a required field is missing)."""

    status_code = 502
    code = "source_data_error"


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
