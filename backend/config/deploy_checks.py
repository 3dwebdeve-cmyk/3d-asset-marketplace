"""Production secrets / hosts / TLS readiness helpers (Phase A2).

Used by ``manage.py check_deploy_config`` and Django ``check --deploy``
security checks. Does not invent new environment variables — validates
values already documented in ``docs/PRODUCTION_CHECKLIST.md`` §1.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence
from urllib.parse import urlparse

from django.conf import settings
from django.core.checks import Error, Tags, Warning, register

# Placeholders from root / backend ``.env.example`` (never use on staging/prod).
EXAMPLE_SECRET_KEYS = frozenset(
    {
        "change-me-to-a-long-random-string-at-least-32-bytes",
    }
)

EXAMPLE_DB_PASSWORDS = frozenset(
    {
        "change-me-db-password",
        "postgres",
        "password",
        "marketplace",
    }
)

# Compose service names + loopback — fine for local stack, not a public host.
_LOCAL_HOST_NAMES = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
        "web",
        "frontend",
    }
)


def secret_key_is_example(key: str | None = None) -> bool:
    raw = (
        key if key is not None else getattr(settings, "SECRET_KEY", "") or ""
    ).strip()
    return raw in EXAMPLE_SECRET_KEYS


def db_password_is_weak(password: str | None = None) -> bool:
    """True when empty, shorter than 12 chars, or an example / trivial value."""
    if password is None:
        password = (
            settings.DATABASES.get("default", {}).get("PASSWORD", "") or ""
        )
    raw = str(password).strip()
    if len(raw) < 12:
        return True
    return raw.lower() in {p.lower() for p in EXAMPLE_DB_PASSWORDS}


def allowed_hosts_has_wildcard(hosts: Sequence[str] | None = None) -> bool:
    values = (
        list(hosts)
        if hosts is not None
        else list(getattr(settings, "ALLOWED_HOSTS", []) or [])
    )
    return any(host.strip() == "*" for host in values)


def allowed_hosts_are_local_only(hosts: Sequence[str] | None = None) -> bool:
    values = [
        host.strip()
        for host in (
            list(hosts)
            if hosts is not None
            else list(getattr(settings, "ALLOWED_HOSTS", []) or [])
        )
        if host and host.strip()
    ]
    if not values:
        return True
    if any(host == "*" for host in values):
        return False
    return all(host.lower() in _LOCAL_HOST_NAMES for host in values)


def origin_host_is_local(origin: str) -> bool:
    host = (urlparse((origin or "").strip()).hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def origins_are_local_only(origins: Sequence[str] | None = None) -> bool:
    values = [
        origin.strip()
        for origin in (
            list(origins)
            if origins is not None
            else list(getattr(settings, "CORS_ALLOWED_ORIGINS", []) or [])
        )
        if origin and origin.strip()
    ]
    if not values:
        return True
    return all(origin_host_is_local(origin) for origin in values)


def csrf_trusted_origins(settings_obj=settings) -> list[str]:
    return [
        origin.strip()
        for origin in (getattr(settings_obj, "CSRF_TRUSTED_ORIGINS", []) or [])
        if origin and str(origin).strip()
    ]


@dataclass(frozen=True)
class DeployConfigReport:
    """Structured snapshot for operators (no secret values printed)."""

    debug: bool
    secret_key_length: int
    secret_key_is_example: bool
    allowed_hosts: list[str]
    allowed_hosts_wildcard: bool
    allowed_hosts_local_only: bool
    frontend_base_url: str
    frontend_is_local: bool
    cors_origins_count: int
    cors_origins_local_only: bool
    public_api_base_url: str
    public_api_is_local: bool
    csrf_trusted_origins_count: int
    secure_ssl_redirect: bool | None
    secure_hsts_seconds: int | None
    db_password_weak: bool
    meili_master_key_weak: bool
    redis_url_set: bool
    warnings: list[str]


def collect_deploy_config_report(settings_obj=settings) -> DeployConfigReport:
    """Build a report + launch warnings for the current Django settings."""
    from config.mail import frontend_base_url, frontend_base_url_is_localhost
    from search.client import master_key_is_weak

    debug = bool(getattr(settings_obj, "DEBUG", False))
    secret = str(getattr(settings_obj, "SECRET_KEY", "") or "")
    hosts = [
        host.strip()
        for host in (getattr(settings_obj, "ALLOWED_HOSTS", []) or [])
        if host and str(host).strip()
    ]
    frontend = frontend_base_url()
    cors = [
        origin.strip()
        for origin in (getattr(settings_obj, "CORS_ALLOWED_ORIGINS", []) or [])
        if origin and str(origin).strip()
    ]
    public_api = str(
        getattr(settings_obj, "PUBLIC_API_BASE_URL", "") or ""
    ).rstrip("/")
    csrf = csrf_trusted_origins(settings_obj)
    ssl_redirect = getattr(settings_obj, "SECURE_SSL_REDIRECT", None)
    hsts = getattr(settings_obj, "SECURE_HSTS_SECONDS", None)
    db_password = (
        (getattr(settings_obj, "DATABASES", {}) or {})
        .get("default", {})
        .get("PASSWORD", "")
        or ""
    )
    redis_set = bool(str(getattr(settings_obj, "REDIS_URL", "") or "").strip())
    meili_weak = master_key_is_weak(
        getattr(settings_obj, "MEILI_MASTER_KEY", "") or ""
    )
    example_secret = secret_key_is_example(secret)
    wildcard = allowed_hosts_has_wildcard(hosts)
    hosts_local = allowed_hosts_are_local_only(hosts)
    frontend_local = frontend_base_url_is_localhost(frontend)
    cors_local = origins_are_local_only(cors)
    public_local = origin_host_is_local(public_api) if public_api else True
    weak_db = db_password_is_weak(str(db_password))

    warnings: list[str] = []

    if example_secret:
        warnings.append(
            "SECRET_KEY still matches the .env.example placeholder - "
            "generate a unique value (e.g. openssl rand -base64 48)."
        )
    if wildcard:
        warnings.append(
            "ALLOWED_HOSTS contains '*' - use explicit public hostname(s) only."
        )
    if not debug and hosts_local:
        warnings.append(
            "ALLOWED_HOSTS is local/Compose-only while DEBUG=False - "
            "set the public hostname(s) for staging/prod."
        )
    if not debug and not csrf:
        warnings.append(
            "CSRF_TRUSTED_ORIGINS is empty while DEBUG=False - "
            "set https://... SPA/API origins (required for cookie/CSRF)."
        )
    if not debug and frontend_local:
        warnings.append(
            "FRONTEND_BASE_URL points at localhost while DEBUG=False - "
            "verification emails will be unusable for real customers."
        )
    if not debug and cors_local:
        warnings.append(
            "CORS_ALLOWED_ORIGINS is localhost-only while DEBUG=False - "
            "add the public SPA origin(s)."
        )
    if not debug and public_api and public_local:
        warnings.append(
            "PUBLIC_API_BASE_URL points at localhost while DEBUG=False - "
            "set the public API/SPA HTTPS origin."
        )
    if not debug and ssl_redirect is False:
        warnings.append(
            "SECURE_SSL_REDIRECT is False while DEBUG=False - "
            "set True when TLS terminates at Cloudflare / load balancer "
            "(keep False only for local HTTP Compose)."
        )
    if (
        not debug
        and ssl_redirect is True
        and isinstance(hsts, int)
        and hsts <= 0
    ):
        warnings.append(
            "SECURE_HSTS_SECONDS is 0 while SSL redirect is enabled - "
            "set e.g. 31536000 after HTTPS works end-to-end."
        )
    if not debug and weak_db:
        warnings.append(
            "DB_PASSWORD is empty, shorter than 12 characters, or an "
            "example/trivial value - use a strong unique password."
        )
    if not debug and meili_weak:
        warnings.append(
            "MEILI_MASTER_KEY is empty, shorter than 16 characters, or an "
            "example placeholder - set a unique key matching the Meili service."
        )
    if not debug and not redis_set:
        warnings.append(
            "REDIS_URL is empty while DEBUG=False - required for shared cache, "
            "throttles, and checkout idempotency."
        )

    return DeployConfigReport(
        debug=debug,
        secret_key_length=len(secret.encode("utf-8")),
        secret_key_is_example=example_secret,
        allowed_hosts=hosts,
        allowed_hosts_wildcard=wildcard,
        allowed_hosts_local_only=hosts_local,
        frontend_base_url=frontend,
        frontend_is_local=frontend_local,
        cors_origins_count=len(cors),
        cors_origins_local_only=cors_local,
        public_api_base_url=public_api or "(empty)",
        public_api_is_local=public_local,
        csrf_trusted_origins_count=len(csrf),
        secure_ssl_redirect=ssl_redirect if isinstance(ssl_redirect, bool) else None,
        secure_hsts_seconds=hsts if isinstance(hsts, int) else None,
        db_password_weak=weak_db,
        meili_master_key_weak=meili_weak,
        redis_url_set=redis_set,
        warnings=warnings,
    )


@register(Tags.security, deploy=True)
def check_example_secret_key(app_configs, **kwargs):
    """Surface example SECRET_KEY under ``manage.py check --deploy``."""
    if secret_key_is_example():
        return [
            Error(
                "SECRET_KEY matches the documented .env.example placeholder.",
                hint=(
                    "Generate a unique key (openssl rand -base64 48) before "
                    "staging/prod. See docs/DEPLOY_SECRETS_STAGING_CHECKLIST.md."
                ),
                id="config.E001",
            )
        ]
    return []


@register(Tags.security, deploy=True)
def check_allowed_hosts_wildcard(app_configs, **kwargs):
    if allowed_hosts_has_wildcard():
        return [
            Error(
                "ALLOWED_HOSTS must not contain '*'.",
                hint="List explicit public hostname(s) only.",
                id="config.E002",
            )
        ]
    return []


@register(Tags.security, deploy=True)
def check_csrf_trusted_origins_when_secure(app_configs, **kwargs):
    if settings.DEBUG:
        return []
    if csrf_trusted_origins():
        return []
    return [
        Warning(
            "CSRF_TRUSTED_ORIGINS is empty while DEBUG=False.",
            hint=(
                "Set comma-separated https://… origins for the SPA/API. "
                "See docs/PRODUCTION_CHECKLIST.md §1."
            ),
            id="config.W001",
        )
    ]
