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

    # Optional app token for data.transportation.gov (raises Socrata rate limits).
    socrata_app_token: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
