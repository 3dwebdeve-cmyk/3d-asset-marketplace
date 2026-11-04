"""HTTP client for the plugin ingest API (API key). Talks only to the two plugin ingest routes."""

from __future__ import annotations

from typing import Any

import requests

from plugin_uploader.core import UploaderError

TIMEOUT_SECONDS = 60


class IngestApi:
    def __init__(self, base_url: str, api_key: str, session: requests.Session | None = None) -> None:
        if not base_url.lower().startswith("https://") and not base_url.startswith("http://127.0.0.1"):
            raise UploaderError("The API address must start with https://.")
        self.base_url = base_url.rstrip("/")
        self.session = session or requests.Session()
        self.session.headers["Authorization"] = f"Api-Key {api_key}"
        self.session.headers["Accept"] = "application/json"

    def next_ids(self) -> dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/api/v1/catalog-ingest/plugins/next-ids/", timeout=TIMEOUT_SECONDS
        )
        return _json_or_raise(response, "Could not read the next plugin numbers")

    def import_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.session.post(
            f"{self.base_url}/api/v1/catalog-ingest/plugins/import/",
            json=payload,
            timeout=TIMEOUT_SECONDS,
        )
        return _json_or_raise(response, "The import was refused")


def _json_or_raise(response: requests.Response, what: str) -> dict[str, Any]:
    if response.status_code == 401 or response.status_code == 403:
        raise UploaderError(f"{what}: the API key was refused. Check the key and its scope (plugins).")
    if response.status_code >= 400:
        detail = ""
        try:
            detail = str(response.json().get("detail") or response.text)
        except ValueError:
            detail = response.text[:200]
        raise UploaderError(f"{what} (HTTP {response.status_code}): {detail}")
    return response.json()
