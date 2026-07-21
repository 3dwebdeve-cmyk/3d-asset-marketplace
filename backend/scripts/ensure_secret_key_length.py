"""Ensure SECRET_KEY in .env is at least 32 UTF-8 bytes (HS256 minimum)."""

from __future__ import annotations

import re
import secrets
import sys
from pathlib import Path

MIN_BYTES = 32
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
SECRET_KEY_RE = re.compile(r"^(SECRET_KEY\s*=\s*)(.*)$", re.MULTILINE)


def key_byte_length(value: str) -> int:
    # Strip optional surrounding quotes used in .env files.
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1]
    return len(cleaned.encode("utf-8"))


def generate_secret_key() -> str:
    # 50 url-safe bytes → well above the 32-byte HS256 recommendation.
    return secrets.token_urlsafe(50)


def main() -> int:
    if not ENV_PATH.exists():
        print(f"missing env file: {ENV_PATH}", file=sys.stderr)
        return 1

    text = ENV_PATH.read_text(encoding="utf-8")
    match = SECRET_KEY_RE.search(text)
    if not match:
        print("SECRET_KEY not found in .env", file=sys.stderr)
        return 1

    current = match.group(2)
    current_len = key_byte_length(current)
    print(f"current SECRET_KEY length: {current_len} bytes")

    if current_len >= MIN_BYTES:
        print(f"OK: already >= {MIN_BYTES} bytes")
        return 0

    new_key = generate_secret_key()
    new_len = key_byte_length(new_key)
    updated = SECRET_KEY_RE.sub(rf"\g<1>{new_key}", text, count=1)
    ENV_PATH.write_text(updated, encoding="utf-8")
    print(f"updated SECRET_KEY length: {new_len} bytes (>= {MIN_BYTES})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
