"""How often one visitor may try something: a sliding window of attempts per key, in memory.

Kept per process, so limits start over on a restart and multiply with the number of processes
(the API runs as one). That is enough to stop password guessing and mass sign-ups; hosting with
several instances would need a shared store.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from app.core.exceptions import RateLimitedError

MAX_KEYS = 100_000  # above this the oldest attempts are forgotten, so memory stays bounded
LONGEST_WINDOW = 36000.0


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._attempts: dict[str, deque[float]] = {}

    def _recent(self, key: str, window: float, now: float) -> deque[float]:
        attempts = self._attempts.setdefault(key, deque())
        while attempts and attempts[0] <= now - window:
            attempts.popleft()
        return attempts

    def check(self, key: str, limit: int, window: float) -> None:
        """Raises RateLimitedError when `key` has used its `limit` attempts in `window` seconds."""
        with self._lock:
            now = self._clock()
            attempts = self._recent(key, window, now)
            if len(attempts) >= limit:
                raise RateLimitedError(math.ceil(attempts[0] + window - now))
            if not attempts:
                del self._attempts[key]

    def record(self, key: str, window: float) -> None:
        with self._lock:
            now = self._clock()
            if len(self._attempts) >= MAX_KEYS:
                self._forget_old(now)
            self._recent(key, window, now).append(now)

    def hit(self, key: str, limit: int, window: float) -> None:
        """One attempt: refused when over the limit, counted otherwise."""
        self.check(key, limit, window)
        self.record(key, window)

    def clear(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)

    def reset(self) -> None:
        with self._lock:
            self._attempts.clear()

    def _forget_old(self, now: float) -> None:
        stale = [k for k, a in self._attempts.items() if not a or a[-1] <= now - LONGEST_WINDOW]
        for key in stale:
            del self._attempts[key]
        if len(self._attempts) >= MAX_KEYS:
            self._attempts.clear()


limiter = RateLimiter()
