"""Domain exceptions and their single mapping to HTTP responses."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class CarrierSafetyScanError(Exception):
    """Base class for all application errors."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(CarrierSafetyScanError):
    status_code = 404
    code = "not_found"


class CarrierNotFoundError(NotFoundError):
    code = "carrier_not_found"


class DataQsCaseNotFoundError(NotFoundError):
    """No such DataQs case, or not one this user may see (the answer is the same)."""

    code = "dataqs_case_not_found"


class ValidationError(CarrierSafetyScanError):
    status_code = 422
    code = "validation_error"


class UnauthorizedError(CarrierSafetyScanError):
    """Not logged in, or the session has expired."""

    status_code = 401
    code = "not_authenticated"


class ForbiddenError(CarrierSafetyScanError):
    """Logged in, but this user may not do this (wrong portal, pending or disabled account)."""

    status_code = 403
    code = "forbidden"


class DataQsMissingAuthorityError(ForbiddenError):
    """A DataQs case needs a verified carrier of the client company, and a user allowed to act."""

    code = "dataqs_missing_authority"


class AccountPendingError(ForbiddenError):
    code = "account_pending"


class AccountDisabledError(ForbiddenError):
    code = "account_disabled"


class EmailNotVerifiedError(ForbiddenError):
    """Right password, but the account's email hasn't been confirmed yet."""

    code = "email_not_verified"


class ConflictError(CarrierSafetyScanError):
    status_code = 409
    code = "conflict"


class DataQsDuplicateCaseError(ConflictError):
    """An open DataQs case already covers the same event and violation."""

    code = "dataqs_duplicate_case"


class DataQsStaleVersionError(ConflictError):
    """The case changed since the caller read it; reload and try again."""

    code = "dataqs_stale_version"


class DataQsInvalidTransitionError(ConflictError):
    """Not allowed at the case's current stage (e.g. uploading to a closed case)."""

    code = "dataqs_invalid_transition"


class DataQsEvidenceRejectedError(ValidationError):
    """An uploaded file is empty, too large, or not an allowed type."""

    code = "dataqs_evidence_rejected"


class DataQsStorageUnavailableError(CarrierSafetyScanError):
    """Evidence storage is not configured or did not answer."""

    status_code = 503
    code = "dataqs_storage_unavailable"


class BookingUnavailableError(CarrierSafetyScanError):
    """STS's booking page (skytransportsolutions.com) isn't set up or can't be reached."""

    status_code = 503


class SubscriptionRequiredError(CarrierSafetyScanError):
    """The free trial is over and there's no live subscription: subscribe to keep using the app."""

    status_code = 402
    code = "subscription_required"


class PaymentUnavailableError(CarrierSafetyScanError):
    """Online payment (Stripe) isn't set up or can't be reached."""

    status_code = 503


class BotCheckFailedError(CarrierSafetyScanError):
    """The form's Cloudflare Turnstile token is missing or was refused."""

    status_code = 400
    code = "bot_check_failed"


class RateLimitedError(CarrierSafetyScanError):
    """Too many attempts in a short time; `retry_after` says when to try again (seconds)."""

    status_code = 429
    code = "rate_limited"

    def __init__(self, retry_after: int) -> None:
        minutes = max(1, (retry_after + 59) // 60)
        if minutes > 90:
            wait = f"{(minutes + 59) // 60} hours"
        else:
            wait = f"{minutes} minute{'' if minutes == 1 else 's'}"
        super().__init__(f"Too many attempts. Please try again in {wait}.")
        self.retry_after = retry_after


class SourceFetchError(CarrierSafetyScanError):
    """An external data source (data.transportation.gov, NHTSA, ...) failed or returned bad data."""

    status_code = 502
    code = "source_fetch_error"


class SourceDataError(CarrierSafetyScanError):
    """A source record was fetched but cannot be normalized (e.g. a required field is missing)."""

    status_code = 502
    code = "source_data_error"


class DatabaseUnavailableError(CarrierSafetyScanError):
    status_code = 503
    code = "database_unavailable"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(CarrierSafetyScanError)
    async def handle_carrier_safety_scan_error(
        _: Request, exc: CarrierSafetyScanError
    ) -> JSONResponse:
        log = logger.error if exc.status_code >= 500 else logger.info
        log("%s: %s", exc.code, exc.message)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
            headers=(
                {"Retry-After": str(exc.retry_after)} if isinstance(exc, RateLimitedError) else None
            ),
        )
