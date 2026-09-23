"""Stubs kept so older imports resolve. Meilisearch is not used."""

from __future__ import annotations

from typing import Any


def is_configured() -> bool:
    return False


def is_required() -> bool:
    return False


def get_client() -> Any:
    return None


def probe_meilisearch(client: Any) -> bool:
    del client
    return False


def master_key_is_weak(key: str | None = None) -> bool:
    del key
    return False
