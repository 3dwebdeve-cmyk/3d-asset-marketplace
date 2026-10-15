#!/usr/bin/env python3
"""Upload an encrypted Postgres dump to the separate R2 backup bucket.

The backup bucket has its own API token. The app's R2 token cannot read backups, so
a leaked app key does not expose the customer database, and the bucket's lock rule
stops anyone (including that token) deleting a backup early.

Usage:
  python backend/scripts/upload_backup_to_r2.py ./backups/marketplace-....dump.age

Requires: R2_ENDPOINT_URL (or R2_ACCOUNT_ID), R2_BACKUP_BUCKET,
R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY. Object key: postgres/<filename>
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ENCRYPTED_SUFFIX = ".age"


def _endpoint() -> str:
    explicit = (os.environ.get("R2_ENDPOINT_URL") or "").strip()
    if explicit:
        return explicit
    account = (os.environ.get("R2_ACCOUNT_ID") or "").strip()
    if not account:
        raise SystemExit("R2_ENDPOINT_URL or R2_ACCOUNT_ID is required for upload.")
    return f"https://{account}.r2.cloudflarestorage.com"


def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <dump-file>", file=sys.stderr)
        return 2

    dump_path = Path(sys.argv[1]).resolve()
    if not dump_path.is_file():
        print(f"missing dump file: {dump_path}", file=sys.stderr)
        return 1
    if dump_path.suffix != ENCRYPTED_SUFFIX:
        print("Refusing to upload an unencrypted backup (expected a .age file).", file=sys.stderr)
        return 1

    bucket = _env("R2_BACKUP_BUCKET")
    access_key = _env("R2_BACKUP_ACCESS_KEY_ID")
    secret_key = _env("R2_BACKUP_SECRET_ACCESS_KEY")
    if not bucket or not access_key or not secret_key:
        print(
            "R2_BACKUP_BUCKET, R2_BACKUP_ACCESS_KEY_ID and R2_BACKUP_SECRET_ACCESS_KEY "
            "are required.",
            file=sys.stderr,
        )
        return 1
    if bucket in {_env("R2_PUBLIC_BUCKET"), _env("R2_PRIVATE_BUCKET")}:
        print("Refusing to upload a backup into an app bucket.", file=sys.stderr)
        return 1
    if access_key == _env("R2_ACCESS_KEY_ID"):
        print(
            "Refusing to use the app's R2 key for backups; create a separate backup token.",
            file=sys.stderr,
        )
        return 1

    try:
        import boto3
    except ImportError:
        print("boto3 is required (install backend/requirements.txt).", file=sys.stderr)
        return 1

    key = f"postgres/{dump_path.name}"
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
