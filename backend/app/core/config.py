"""Application settings, loaded from environment variables and `backend/.env`."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]

_INSECURE_DEFAULT_SECRET = "dev-only-insecure-secret-change-me-0123456789"


def _normalize_database_url(url: str) -> str:
    """Hosted Postgres providers (Neon, Vercel) hand out postgres:// or postgresql:// URLs;
    point them at the psycopg 3 driver that ArabDev installs."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ArabDev API"
    environment: Literal["development", "production", "test"] = "development"
    api_v1_prefix: str = "/api/v1"

    # SQLite file for local development (backend/arabdev.db by default), or a PostgreSQL URL
    # in production, e.g. the one Neon adds to a Vercel project.
    database_url: str = "sqlite:///" + (BASE_DIR / "arabdev.db").as_posix()
    # Optional direct (non-pooled) PostgreSQL URL, used for migrations when available.
    database_url_unpooled: str | None = None
    database_echo: bool = False
    # Apply migrations and reference data when the app starts (see app/core/bootstrap.py).
    auto_migrate: bool = True

    # Set to 1 automatically by Vercel. Switches on the settings serverless hosting needs.
    vercel: bool = False
    # Vercel sends this as a bearer token when it calls the scheduled clean-up endpoint.
    cron_secret: str | None = None

    # Optional. When unset, rate limiting and caching fall back to in-process memory.
    redis_url: str | None = None

    secret_key: str = _INSECURE_DEFAULT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    refresh_token_session_hours: int = 12
    refresh_reuse_grace_seconds: int = 20
    password_reset_expire_minutes: int = 30

    refresh_cookie_name: str = "arabdev_refresh"
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    # Public address of the app, used in emails. Production: https://arabdev.site
    frontend_url: str = "http://localhost:5173"
    support_email: str = "support@arabdev.site"
    hello_email: str = "hi@arabdev.site"
    # Sender of outgoing mail. Replies go to support, since nobody reads noreply@.
    mail_from: str = "ArabDev <noreply@arabdev.site>"

    # SMTP. Without a host, mail is logged instead of sent (see services/email_service.py).
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    smtp_ssl: bool = False
    smtp_timeout_seconds: float = 10.0

    # Six-digit codes emailed when signing in, signing up and changing an email or password.
    verification_code_ttl_minutes: int = 10
    verification_max_attempts: int = 5
    verification_resend_seconds: int = 60
    # Leave unset to follow the mail setup: on in development, and in production only once
    # SMTP is configured, so a missing mail provider cannot lock everyone out.
    email_codes_enabled: bool | None = None

    # Cloudflare Turnstile. Both keys must be present for the checks to run.
    turnstile_site_key: str | None = None
    turnstile_secret_key: str | None = None
    turnstile_verify_url: str = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    turnstile_timeout_seconds: float = 8.0
    # Refuse a token whose Turnstile hostname is not one of these (empty: accept any).
    turnstile_hostnames: Annotated[list[str], NoDecode] = []

    # "local" writes files under media_root; "database" keeps them in the media table, for
    # hosts without a persistent disk such as Vercel.
    storage_backend: Literal["local", "database"] = "local"
    media_root: Path = BASE_DIR / "media"
    media_url: str = "/media"
    max_upload_bytes: int = 5 * 1024 * 1024

    rate_limit_enabled: bool = True

    @field_validator("cors_origins", "turnstile_hostnames", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("database_url", "database_url_unpooled")
    @classmethod
    def _normalize_urls(cls, value: str | None) -> str | None:
        return _normalize_database_url(value) if value else value

    @model_validator(mode="after")
    def _serverless_defaults(self) -> "Settings":
        if self.vercel:
            explicit = self.model_fields_set
            if "environment" not in explicit:
                self.environment = "production"
            if "storage_backend" not in explicit:
                self.storage_backend = "database"
            if "cookie_secure" not in explicit:
                self.cookie_secure = True
            if "frontend_url" not in explicit:
                self.frontend_url = "https://arabdev.site"
            if self.is_sqlite:
                raise ValueError(
                    "DATABASE_URL must point to PostgreSQL on Vercel: add a Neon database "
                    "under the project's Storage tab"
                )
        return self

    @model_validator(mode="after")
    def _check_production_secret(self) -> "Settings":
        if self.environment == "production" and self.secret_key == _INSECURE_DEFAULT_SECRET:
            raise ValueError("SECRET_KEY must be set in production")
        return self

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host)

    @property
    def turnstile_configured(self) -> bool:
        return bool(self.turnstile_site_key and self.turnstile_secret_key)

    @property
    def email_codes_required(self) -> bool:
        """Whether sign-in, sign-up and account changes ask for an emailed code."""
        if self.email_codes_enabled is not None:
            return self.email_codes_enabled
        return self.smtp_configured or self.environment == "development"

    @property
    def migration_url(self) -> str:
        return self.database_url_unpooled or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
