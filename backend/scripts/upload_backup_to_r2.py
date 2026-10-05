#!/usr/bin/env python3
"""Upload a Postgres dump to the private R2 bucket using the same R2_* env as the app.

Does not invent a second storage stack — boto3 + R2_ENDPOINT_URL / keys / R2_PRIVATE_BUCKET.

Usage:
  python backend/scripts/upload_backup_to_r2.py ./backups/marketplace-....dump

Requires: R2_ACCOUNT_ID (or R2_ENDPOINT_URL), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
R2_PRIVATE_BUCKET. Object key: backups/postgres/<filename>
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _endpoint() -> str:
    explicit = (os.environ.get("R2_ENDPOINT_URL") or "").strip()
    if explicit:
        return explicit
    account = (os.environ.get("R2_ACCOUNT_ID") or "").strip()
    if not account:
        raise SystemExit("R2_ENDPOINT_URL or R2_ACCOUNT_ID is required for upload.")
    return f"https://{account}.r2.cloudflarestorage.com"


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <dump-file>", file=sys.stderr)
        return 2

    dump_path = Path(sys.argv[1]).resolve()
    if not dump_path.is_file():
        print(f"missing dump file: {dump_path}", file=sys.stderr)
        return 1

    access_key = (os.environ.get("R2_ACCESS_KEY_ID") or "").strip()
    secret_key = (os.environ.get("R2_SECRET_ACCESS_KEY") or "").strip()
    bucket = (os.environ.get("R2_PRIVATE_BUCKET") or "").strip()
    public_bucket = (os.environ.get("R2_PUBLIC_BUCKET") or "").strip()
    if public_bucket and bucket == public_bucket:
        print("Refusing to upload a database backup to the public bucket.", file=sys.stderr)
        return 1
    if not access_key or not secret_key or not bucket:
        print(
            "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_PRIVATE_BUCKET are required.",
            file=sys.stderr,
        )
        return 1

    try:
        import boto3
    except ImportError:
        print("boto3 is required (install backend/requirements.txt).", file=sys.stderr)
        return 1

    key = f"backups/postgres/{dump_path.name}"
    client = boto3.client(
        "s3",
        endpoint_url=_endpoint(),
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )
    client.upload_file(str(dump_path), bucket, key)
    print(f"upload_backup_to_r2: ok s3://{bucket}/{key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
