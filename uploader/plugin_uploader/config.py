"""Settings for the uploader.

Nothing secret is stored in the program or in the repository. Secrets come from environment
variables, or from a ``settings.local.json`` file next to the exe that the operator creates
and never shares or commits.

Environment variables (or the matching keys in settings.local.json):
    PLUGIN_UPLOADER_API_KEY         the plugins-scope API key
    PLUGIN_UPLOADER_R2_ACCESS_KEY   R2 access key id
    PLUGIN_UPLOADER_R2_SECRET_KEY   R2 secret access key
Public settings (non-secret) live in settings.json next to the exe.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from plugin_uploader.core import UploaderError
from plugin_uploader.storage import R2Settings


@dataclass(frozen=True)
class UploaderConfig:
    api_base_url: str
    api_key: str
    r2: R2Settings


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise UploaderError(f"{path.name} could not be read: {exc}") from exc


def load_config(folder: Path) -> UploaderConfig:
    public = _read_json(folder / "settings.json")
    local = _read_json(folder / "settings.local.json")

    def secret(env: str, key: str) -> str:
        return (os.environ.get(env) or local.get(key) or "").strip()

    api_key = secret("PLUGIN_UPLOADER_API_KEY", "api_key")
    access = secret("PLUGIN_UPLOADER_R2_ACCESS_KEY", "r2_access_key_id")
    secret_key = secret("PLUGIN_UPLOADER_R2_SECRET_KEY", "r2_secret_access_key")
    missing = [
        label
        for label, value in (
            ("API key", api_key),
            ("R2 access key", access),
            ("R2 secret key", secret_key),
            ("API address (settings.json: api_base_url)", public.get("api_base_url", "")),
            ("R2 endpoint (settings.json: r2_endpoint_url)", public.get("r2_endpoint_url", "")),
            ("private bucket (settings.json: r2_private_bucket)", public.get("r2_private_bucket", "")),
            ("public bucket (settings.json: r2_public_bucket)", public.get("r2_public_bucket", "")),
        )
        if not value
    ]
    if missing:
        raise UploaderError("Missing settings: " + "; ".join(missing))
    return UploaderConfig(
        api_base_url=public["api_base_url"],
        api_key=api_key,
        r2=R2Settings(
            endpoint_url=public["r2_endpoint_url"],
            access_key_id=access,
            secret_access_key=secret_key,
            private_bucket=public["r2_private_bucket"],
            public_bucket=public["r2_public_bucket"],
        ),
    )
