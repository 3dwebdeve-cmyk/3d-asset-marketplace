"""Catalog search query helpers. Search is Postgres ``icontains`` only."""

from __future__ import annotations

MAX_QUERY_LENGTH = 100
# Single-character icontains matches nearly every row and is a cheap DB-load lever.
MIN_QUERY_LENGTH = 2


def normalize_query(search: str | None) -> str | None:
    if not search:
        return None
    query = search.strip()
    if len(query) < MIN_QUERY_LENGTH:
        return None
    return query[:MAX_QUERY_LENGTH]
