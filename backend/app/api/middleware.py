"""Request ID middleware: every request gets an ID that appears in logs and the response header."""

import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from app.core.logging import request_id_var

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"


async def request_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
    token = request_id_var.set(request_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "%s %s -> %s (%.1f ms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
    finally:
        request_id_var.reset(token)
