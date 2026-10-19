"""Phase K1 — PRODUCTION_CHECKLIST §2 cutover gate (compose existing checkers).

Orchestrates deploy / email / Stripe / R2 / Sentry / auth / ops / search /
healthz readiness for ``local``, ``staging``, and ``production`` profiles.
Does not invent new env vars or print secrets. Operator still executes
host steps (immutable tags, Compose up, backup drill, DNS, 24h Sentry).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import urlparse

from django.conf import settings
from django.core import checks as django_checks
from django.test import Client
from django.urls import reverse

from accounts.models import User
from config.deploy_checks import collect_deploy_config_report
from config.mail import (
    frontend_base_url,
    frontend_base_url_is_localhost,
    frontend_base_url_uses_https,
)
from payments.stripe_config import collect_stripe_config_report

CutoverProfile = Literal["local", "staging", "production"]


@dataclass(frozen=True)
class CutoverCheck:
    name: str
    ok: bool
    detail: str
    blocking: bool = True


@dataclass(frozen=True)
class CutoverGateResult:
    profile: CutoverProfile
    checks: tuple[CutoverCheck, ...]
    debug: bool
    warnings: tuple[str, ...] = field(default_factory=tuple)
    manual_reminders: tuple[str, ...] = field(default_factory=tuple)

    @property
    def blocking_failures(self) -> tuple[CutoverCheck, ...]:
        return tuple(c for c in self.checks if c.blocking and not c.ok)

    @property
    def all_ok(self) -> bool:
        return not self.blocking_failures


class CutoverGateError(Exception):
    """Operator-facing gate failure (no secrets in message)."""


def _parse_recipients(raw: str) -> list[str]:
    return [part.strip() for part in (raw or "").split(",") if part.strip()]


def _host_like_profile(profile: CutoverProfile) -> bool:
    return profile in {"staging", "production"}


def _check_deploy(profile: CutoverProfile) -> CutoverCheck:
    report = collect_deploy_config_report()
    detail = (
        f"DEBUG={report.debug} "
        f"SECRET_KEY_is_example={report.secret_key_is_example} "
        f"ALLOWED_HOSTS_local_only={report.allowed_hosts_local_only} "
        f"CSRF_count={report.csrf_trusted_origins_count} "
        f"ALLOW_LOCALHOST_FRONTEND={report.allow_localhost_frontend} "
        f"ALLOW_CONSOLE_EMAIL={report.allow_console_email}"
    )
    if not _host_like_profile(profile):
        return CutoverCheck(
            name="deploy_secrets",
            ok=True,
            detail=detail + " (local profile — host gates advisory)",
            blocking=False,
        )
    if report.warnings or report.debug:
        return CutoverCheck(
            name="deploy_secrets",
            ok=False,
            detail=f"{detail}; issues={len(report.warnings) + int(report.debug)}",
            blocking=True,
        )
    return CutoverCheck(name="deploy_secrets", ok=True, detail=detail)


def _check_django_deploy(profile: CutoverProfile, *, enabled: bool) -> CutoverCheck:
    if not enabled:
        return CutoverCheck(
            name="django_deploy_check",
            ok=True,
            detail="skipped",
            blocking=False,
        )
    issues = django_checks.run_checks(include_deployment_checks=True)
    if not issues:
        return CutoverCheck(
            name="django_deploy_check",
            ok=True,
            detail="check --deploy clean",
        )
    # Local / DEBUG=True almost always fails deploy checks.
    if not _host_like_profile(profile):
        return CutoverCheck(
            name="django_deploy_check",
            ok=True,
            detail=f"issues={len(issues)} (expected when DEBUG=True / local)",
            blocking=False,
        )
    return CutoverCheck(
        name="django_deploy_check",
        ok=False,
        detail=f"check --deploy issues={len(issues)}",
        blocking=True,
    )


def _check_email(profile: CutoverProfile, *, require_smtp: bool) -> CutoverCheck:
    backend = (getattr(settings, "EMAIL_BACKEND", "") or "").strip()
    allow_console = bool(getattr(settings, "ALLOW_CONSOLE_EMAIL", False))
    host = (getattr(settings, "EMAIL_HOST", "") or "").strip()
    brevo_key = bool((getattr(settings, "BREVO_API_KEY", "") or "").strip())
    console = "console" in backend.lower()
    brevo = "brevo" in backend.lower()
    smtp = "smtp" in backend.lower() and not brevo
    contact = _parse_recipients(
        getattr(settings, "CONTACT_ADMIN_RECIPIENTS", "") or ""
    )
    project = _parse_recipients(
        getattr(settings, "PROJECT_MESSAGE_ADMIN_RECIPIENTS", "") or ""
    )
    mode = (
        "console"
        if console
        else ("brevo" if brevo else ("smtp" if smtp else "other"))
    )
    detail = (
        f"backend={mode} "
        f"BREVO_API_KEY_set={brevo_key} "
        f"EMAIL_HOST_set={bool(host)} "
        f"ALLOW_CONSOLE_EMAIL={allow_console} "
        f"contact_recipients={len(contact)} "
        f"project_recipients={len(project)}"
    )

    must_outbound = require_smtp or profile == "production"
    if must_outbound:
        problems: list[str] = []
        if console or allow_console:
            problems.append("console mail not allowed")
        if not smtp and not brevo:
            problems.append("EMAIL_BACKEND must be SMTP or Brevo API")
        if smtp and not host:
            problems.append("EMAIL_HOST empty")
        if brevo and not brevo_key:
            problems.append("BREVO_API_KEY empty")
        if not contact or not project:
            problems.append("staff recipients incomplete")
        if problems:
            return CutoverCheck(
                name="email_smtp",
                ok=False,
                detail=f"{detail}; {'; '.join(problems)}",
                blocking=True,
            )
        return CutoverCheck(name="email_smtp", ok=True, detail=detail)

    if _host_like_profile(profile) and (
        console or allow_console or (not smtp and not brevo)
    ):
        return CutoverCheck(
            name="email_smtp",
            ok=True,
            detail=(
                f"{detail}; SMTP/Brevo deferred (Phase A3) — "
                "blocking on --require-smtp / production profile"
            ),
            blocking=False,
        )
    return CutoverCheck(
        name="email_smtp",
        ok=True,
        detail=detail,
        blocking=False,
    )


def _check_stripe(profile: CutoverProfile) -> CutoverCheck:
    payment_mode = getattr(settings, "STRIPE_PAYMENT_MODE", "test")
    if profile == "production" and payment_mode == "live":
        report = collect_stripe_config_report(require_live_mode=True)
    elif profile in {"staging", "production"}:
        report = collect_stripe_config_report(require_test_mode=True)
    else:
        report = collect_stripe_config_report()

    detail = (
        f"payment_mode={payment_mode} secret={report.secret_mode} publishable={report.publishable_mode} "
        f"webhook_set={report.webhook_secret_set} "
        f"webhook_valid={report.webhook_secret_looks_valid} "
        f"E2E_SIMULATE={report.e2e_simulate}"
    )
    if not _host_like_profile(profile):
        return CutoverCheck(
            name="stripe",
            ok=True,
            detail=detail + " (local advisory)",
            blocking=False,
        )
    if report.warnings:
        return CutoverCheck(
            name="stripe",
            ok=False,
            detail=f"{detail}; issues={len(report.warnings)}",
            blocking=True,
        )
    if profile == "staging" and payment_mode != "test":
        return CutoverCheck(name="stripe", ok=False, detail=detail + "; staging requires test payments")
    if profile == "production" and payment_mode == "test" and report.e2e_simulate:
        return CutoverCheck(name="stripe", ok=False, detail=detail + "; simulation forbidden")
    return CutoverCheck(name="stripe", ok=True, detail=detail)


def _check_r2(profile: CutoverProfile) -> CutoverCheck:
    enabled = bool(getattr(settings, "R2_ENABLED", False))
    public_base = (getattr(settings, "R2_PUBLIC_BASE_URL", "") or "").strip()
    detail = f"R2_ENABLED={enabled} R2_PUBLIC_BASE_URL_set={bool(public_base)}"
    if not _host_like_profile(profile):
        return CutoverCheck(
            name="r2_storage",
            ok=True,
            detail=detail + " (local may use filesystem fallback)",
            blocking=False,
        )
    if not enabled:
        return CutoverCheck(
            name="r2_storage",
            ok=False,
            detail=detail + "; both buckets required on staging/prod",
            blocking=True,
        )
    if not public_base:
        return CutoverCheck(
            name="r2_storage",
            ok=False,
            detail=detail + "; R2_PUBLIC_BASE_URL required",
            blocking=True,
        )
    return CutoverCheck(name="r2_storage", ok=True, detail=detail)


def _check_sentry(profile: CutoverProfile, *, require_sentry: bool) -> CutoverCheck:
    dsn = (getattr(settings, "SENTRY_DSN", "") or "").strip()
    environment = (
        getattr(settings, "SENTRY_ENVIRONMENT", "") or ""
    ).strip() or "(empty)"
    release = (getattr(settings, "SENTRY_RELEASE", "") or "").strip() or "(unset)"
    detail = (
        f"SENTRY_DSN_set={bool(dsn)} "
        f"SENTRY_ENVIRONMENT={environment} "
        f"SENTRY_RELEASE={release}"
    )
    must = require_sentry or profile == "production"
    if must and not dsn:
        return CutoverCheck(
            name="sentry",
            ok=False,
            detail=detail + "; DSN required",
            blocking=True,
        )
    if _host_like_profile(profile) and not dsn:
        return CutoverCheck(
            name="sentry",
            ok=True,
            detail=detail + "; set DSN before soft-launch watch window",
            blocking=False,
        )
    return CutoverCheck(
        name="sentry",
        ok=True,
        detail=detail,
        blocking=must,
    )


def _check_auth(profile: CutoverProfile) -> CutoverCheck:
    base = frontend_base_url()
    localhost = frontend_base_url_is_localhost(base)
    allow_localhost = bool(getattr(settings, "ALLOW_LOCALHOST_FRONTEND", False))
    uses_https = frontend_base_url_uses_https(base)
    admin_count = User.objects.filter(
        role__role_name="Administrator",
        is_active=True,
    ).count()
    host = urlparse(base).hostname or "(empty)"
    detail = (
        f"FRONTEND_host={host} https={uses_https} "
        f"ALLOW_LOCALHOST_FRONTEND={allow_localhost} "
        f"active_administrators={admin_count}"
    )
    if not _host_like_profile(profile):
        return CutoverCheck(
            name="auth_frontend",
            ok=True,
            detail=detail + " (local advisory)",
            blocking=False,
        )
    problems: list[str] = []
    if localhost or allow_localhost:
        problems.append("localhost FRONTEND not allowed")
    if not uses_https:
        problems.append("FRONTEND_BASE_URL must be https")
    if admin_count < 1:
        problems.append("no active Administrator")
    if problems:
        return CutoverCheck(
            name="auth_frontend",
            ok=False,
            detail=f"{detail}; {'; '.join(problems)}",
            blocking=True,
        )
    return CutoverCheck(name="auth_frontend", ok=True, detail=detail)


def _check_ops(profile: CutoverProfile) -> CutoverCheck:
    contact = _parse_recipients(
        getattr(settings, "CONTACT_ADMIN_RECIPIENTS", "") or ""
    )
    project = _parse_recipients(
        getattr(settings, "PROJECT_MESSAGE_ADMIN_RECIPIENTS", "") or ""
    )
    admin_count = User.objects.filter(
        role__role_name="Administrator",
        is_active=True,
    ).count()
    detail = (
        f"admins={admin_count} "
        f"contact={len(contact)} project={len(project)}"
    )
    if not _host_like_profile(profile):
        return CutoverCheck(
            name="ops_staff",
            ok=True,
            detail=detail + " (local advisory)",
            blocking=False,
        )
    if admin_count < 1 or not contact or not project:
        return CutoverCheck(
            name="ops_staff",
            ok=False,
            detail=detail + "; staff routing incomplete",
            blocking=True,
        )
    return CutoverCheck(name="ops_staff", ok=True, detail=detail)


def _check_search(profile: CutoverProfile) -> CutoverCheck:
    del profile
    return CutoverCheck(
        name="search_postgres",
        ok=True,
        detail="backend=postgres_icontains",
    )


def _check_healthz() -> CutoverCheck:
    client = Client()
    hosts = [
        h.strip()
        for h in (getattr(settings, "ALLOWED_HOSTS", None) or [])
        if h and str(h).strip() and str(h).strip() != "*"
    ]
    http_host = "testserver"
    for candidate in ("testserver", "localhost", "127.0.0.1"):
        if candidate in hosts:
            http_host = candidate
            break
    else:
        if hosts:
            http_host = hosts[0]

    try:
        # Prefer HTTPS so SECURE_SSL_REDIRECT does not return an HTML redirect.
        response = client.get(
            reverse("healthz"),
            secure=True,
            HTTP_HOST=http_host,
        )
    except Exception as exc:  # pragma: no cover - defensive
        return CutoverCheck(
            name="healthz",
            ok=False,
            detail=f"request failed: {exc.__class__.__name__}",
            blocking=True,
        )
    checks = None
    content_type = (response.get("Content-Type") or "").lower()
    if response.status_code < 500 and "application/json" in content_type:
        try:
            body = response.json()
        except ValueError:
            body = {}
        if isinstance(body, dict):
            checks = body.get("checks")
    detail = f"status={response.status_code} host={http_host} checks={checks}"
    return CutoverCheck(
        name="healthz",
        ok=response.status_code == 200 and "application/json" in content_type,
        detail=detail,
        blocking=True,
    )


def _manual_reminders(profile: CutoverProfile) -> tuple[str, ...]:
    base = (
        "Build/tag immutable images (scripts/build_immutable_images.sh; not :latest only)",
        "docker compose up -d; confirm web healthcheck + worker Up (inspect ping)",
        "Backup drill: backup_postgres.sh + restore_postgres_drill.sh; install cron on host",
        "Soft-launch Stripe test on staging hostname before live keys / DNS cut",
        "Watch Sentry ~24h; keep previous WEB_IMAGE / FRONTEND_IMAGE ready to roll back",
        "Record date/initials in docs/CUTOVER_STAGING_CHECKLIST.md + PRODUCTION_CHECKLIST §0",
    )
    if profile == "production":
        return base + (
            "Keep Stripe test keys for this release; live activation is a separate decision",
            "Cut DNS / Cloudflare proxied; confirm TLS + HSTS after HTTPS works",
        )
    if profile == "staging":
        return base + (
            "Keep sk_test_ keys on staging; do not point live webhooks here",
        )
    return base


def run_cutover_gate(
    *,
    profile: CutoverProfile = "local",
    django_deploy_check: bool = True,
    require_smtp: bool = False,
    require_sentry: bool = False,
) -> CutoverGateResult:
    if profile not in {"local", "staging", "production"}:
        raise CutoverGateError(f"Unknown cutover profile: {profile}")

    checks = (
        _check_deploy(profile),
        _check_django_deploy(profile, enabled=django_deploy_check),
        _check_email(profile, require_smtp=require_smtp),
        _check_stripe(profile),
        _check_r2(profile),
        _check_sentry(profile, require_sentry=require_sentry),
        _check_auth(profile),
        _check_ops(profile),
        _check_search(profile),
        _check_healthz(),
    )

    warnings: list[str] = []
    for check in checks:
        if not check.ok and not check.blocking:
            warnings.append(f"{check.name}: {check.detail}")
        if check.name == "email_smtp" and not check.blocking and profile == "staging":
            warnings.append(
                "SMTP still deferred (Phase A3) — verification/checkout mail "
                "needs real SMTP before public soft-launch."
            )
        if check.name == "sentry" and not check.blocking and "DSN" in check.detail:
            if "SENTRY_DSN_set=False" in check.detail:
                warnings.append(
                    "Sentry DSN unset — soft-launch 24h watch needs H1 operator DSNs."
                )

    return CutoverGateResult(
        profile=profile,
        checks=checks,
        debug=bool(settings.DEBUG),
        warnings=tuple(warnings),
        manual_reminders=_manual_reminders(profile),
    )
