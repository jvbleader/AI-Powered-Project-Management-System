"""
Configuration for the API.
"""

from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from pydantic import computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent

_ENV_FILES = tuple(
    path for path in (ROOT_DIR / ".env", BACKEND_DIR / ".env") if path.is_file()
)


class Settings(BaseSettings):
    """Runtime configuration for the API."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Deploy mode: development | staging | production
    environment: str

    # MySQL
    mysql_user: str
    mysql_password: str
    mysql_database: str
    mysql_host: str
    mysql_host_port: int
    mysql_port: int

    # Redis topology
    redis_host: str
    redis_port: int

    # Secrets / integrations
    secret_key: str
    openai_api_key: str
    azure_storage_connection_string: str

    # Browser origins allowed to call the API
    cors_origins: str

    # Process bind
    app_host: str
    app_port: int

    # JWT policy defaults
    algorithm: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int

    # Non-secret Azure naming convention
    azure_storage_container_name: str

    @computed_field
    @property
    def database_url(self) -> str:
        """Build SQLAlchemy URL from MySQL parts."""
        password = quote_plus(self.mysql_password)
        return (
            f"mysql+pymysql://{self.mysql_user}:{password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )

    @field_validator(
        "environment",
        "mysql_user",
        "mysql_password",
        "mysql_database",
        "mysql_host",
        "redis_host",
        "secret_key",
        "openai_api_key",
        "azure_storage_connection_string",
        "cors_origins",
    )
    @classmethod
    def validate_non_empty_strings(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be empty")
        return stripped

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance (reads .env once)."""
    return Settings()
