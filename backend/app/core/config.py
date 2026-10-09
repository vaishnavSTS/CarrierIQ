"""Application settings, loaded only from environment variables (or a local .env file)."""

from datetime import date
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CarrierIQ API"
    environment: str = "local"
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://carrieriq:carrieriq@localhost:5432/carrieriq"

    # Comma-separated list of allowed frontend origins.
    cors_origins: str = "http://localhost:5173"

    # data.transportation.gov (Socrata). The app token is optional; it raises rate limits.
    socrata_base_url: str = "https://data.transportation.gov"
    socrata_app_token: str | None = None
    socrata_timeout_seconds: float = 30.0
    socrata_page_size: int = 1000
    socrata_max_attempts: int = 4  # retries on network errors, HTTP 429 and 5xx
    socrata_retry_base_seconds: float = 1.0  # backoff: 1s, 2s, 4s, ...

    # On-demand refresh (spec Section 19.2): a carrier older than this is re-fetched on search.
    carrier_refresh_hours: float = 24.0
    # Intelligence signals (spec Section 12): changes older than this are history, not signals.
    signal_lookback_days: int = 730
    # Background worker (spec Section 18): a PostgreSQL-backed job queue, no Redis.
    worker_poll_seconds: float = 5.0  # wait between checks when the queue is empty
    job_max_attempts: int = 4
    job_retry_base_seconds: float = 60.0  # retry n waits base * 2^(n-1): 1, 2, 4 minutes
    job_lock_timeout_minutes: int = 30  # a RUNNING job older than this belonged to a dead worker
    # Scheduled ingestion: the worker queues refreshes of carriers older than carrier_refresh_hours.
    scheduler_enabled: bool = True
    schedule_interval_minutes: float = 15.0
    schedule_batch_size: int = 50  # carriers queued per round, oldest data first
    schedule_failed_cooldown_hours: float = 6.0  # wait after a refresh that gave up
    search_result_limit: int = 20  # name search results
    docket_search_limit: int = 10  # carriers loaded for one docket search

    # NHTSA vPIC VIN decoding (spec Section 19.1): batch endpoint, up to 50 VINs per call.
    vpic_base_url: str = "https://vpic.nhtsa.dot.gov/api/vehicles"
    vpic_batch_size: int = 50
    vpic_parallel_requests: int = 4
    vpic_timeout_seconds: float = 60.0

    # data.transportation.gov dataset IDs (spec Section 19.1: IDs live in configuration).
    census_dataset_id: str = "az4n-8mr2"  # Company Census File
    inspection_dataset_id: str = "fx4q-ay7w"  # Vehicle Inspection File
    inspection_unit_dataset_id: str = "wt8s-2hbx"  # Inspections Per Unit (VINs)
    violation_dataset_id: str = "876r-jsdb"  # Vehicle Inspections and Violations
    # Operating authority: Motus (current, daily) and legacy L&I (frozen on its last refresh).
    motus_carrier_dataset_id: str = "inys-ebih"  # Motus Carrier - All With History
    motus_authhist_dataset_id: str = "yu5v-wbh6"  # Motus AuthHist - All With History
    legacy_carrier_dataset_id: str = "6eyk-hxee"  # Carrier - All With History (legacy L&I)
    legacy_authhist_dataset_id: str = "9mw4-x3tu"  # AuthHist - All With History (legacy L&I)
    motus_insurance_dataset_id: str = "c5y8-a4uz"  # Motus Insur - All With History
    motus_insurance_history_dataset_id: str = "3uet-3z4i"  # Motus InsHist - All With History
    legacy_insurance_dataset_id: str = "ypjt-5ydn"  # Insur - All With History (legacy L&I)
    legacy_insurance_history_dataset_id: str = "6sqe-dvqs"  # InsHist - All With History (legacy)
    legacy_li_frozen_on: date = date(2026, 5, 14)  # "last refreshed on 05/14/2026"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
