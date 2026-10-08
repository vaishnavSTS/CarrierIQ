"""Application settings, loaded only from environment variables (or a local .env file)."""

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

    # data.transportation.gov dataset IDs (spec Section 19.1: IDs live in configuration).
    census_dataset_id: str = "az4n-8mr2"  # Company Census File
    inspection_dataset_id: str = "fx4q-ay7w"  # Vehicle Inspection File
    inspection_unit_dataset_id: str = "wt8s-2hbx"  # Inspections Per Unit (VINs)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
