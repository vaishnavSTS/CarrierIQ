"""Logging setup. Every log line carries the module name and the current request ID."""

import logging
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] [request_id=%(request_id)s] %(message)s"


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
