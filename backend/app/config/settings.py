"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Root of the backend folder
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration for the API."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str

    # JWT / Security
    secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int

    # Redis
    redis_host: str
    redis_port: int

    # AI
    openai_api_key: str

    # Azure Storage
    azure_storage_connection_string: str | None = None
    azure_storage_container_name: str = "avatars"

    # Validators
    @field_validator(
        "database_url",
        "secret_key",
        "algorithm",
        "redis_host",
        "openai_api_key",
    )
    @classmethod
    def validate_non_empty_strings(cls, value: str) -> str:
        """Trim whitespace and reject empty string values."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped

    @field_validator(
        "access_token_expire_minutes",
        "refresh_token_expire_days",
        "redis_port",
    )
    @classmethod
    def validate_positive_numbers(cls, value: int) -> int:
        """Require a positive number."""
        if value <= 0:
            raise ValueError("must be positive")
        return value


# Cached so the .env file is only read once
@lru_cache
def get_settings() -> Settings:
    """Return the cached application settings instance."""
    return Settings()
