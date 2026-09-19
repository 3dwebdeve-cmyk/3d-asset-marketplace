"""Redis URL helpers (optional AUTH without breaking password-less local/CI)."""

from __future__ import annotations

from urllib.parse import quote, urlparse, urlunparse


def redis_url_has_password(url: str) -> bool:
    raw = (url or "").strip()
    if not raw or raw.startswith("memory://"):
        return False
    return bool(urlparse(raw).password)


def apply_redis_password(url: str, password: str) -> str:
    """Inject ``password`` when the URL has none. Existing URL password wins."""
    raw = (url or "").strip()
    secret = (password or "").strip()
    if not raw or not secret or raw.startswith("memory://"):
        return raw
    parsed = urlparse(raw)
    if parsed.password:
        return raw
    host = parsed.hostname or "localhost"
    netloc = f":{quote(secret, safe='')}@{host}"
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return urlunparse(
        (
            parsed.scheme,
            netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )
