"""Copy private R2 objects into a distinct backup or disposable restore bucket.

Runs with the backup token (R2_BACKUP_*), which can read the private bucket and write
the backup bucket. The app's token has no access to backups.
"""

import argparse
import os
import time
import uuid
from datetime import datetime, timezone

import boto3


def backup_credentials():
    access_key = os.environ.get("R2_BACKUP_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("R2_BACKUP_SECRET_ACCESS_KEY", "").strip()
    if not access_key or not secret_key:
        raise SystemExit("R2_BACKUP_ACCESS_KEY_ID and R2_BACKUP_SECRET_ACCESS_KEY are required.")
    if access_key == os.environ.get("R2_ACCESS_KEY_ID", "").strip():
        raise SystemExit("Refusing to use the app's R2 key for backups; create a separate backup token.")
    return access_key, secret_key


def client():
    access_key, secret_key = backup_credentials()
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT_URL"],
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )


def objects(s3, bucket, prefix=""):
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        yield from page.get("Contents", [])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["backup", "restore"])
    parser.add_argument("--prefix", help="Existing backup prefix for restore")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    source = os.environ["R2_PRIVATE_BUCKET"]
    backup = os.environ["R2_BACKUP_BUCKET"]
    restore = os.environ.get("R2_RESTORE_DRILL_BUCKET", "")
    if not backup or backup in {source, os.environ.get("R2_PUBLIC_BUCKET", "")}:
        raise SystemExit("R2_BACKUP_BUCKET must be separate from the app buckets.")
    if args.action == "restore" and (not restore or restore in {source, backup} or not args.prefix):
        raise SystemExit("Restore requires a distinct R2_RESTORE_DRILL_BUCKET and --prefix.")
    s3 = client()
    started = time.monotonic()
    if args.action == "backup":
        source_bucket, destination_bucket = source, backup
        source_prefix = ""
        target_prefix = "snapshots/" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8] + "/"
    else:
        source_bucket, destination_bucket = backup, restore
        source_prefix = args.prefix.rstrip("/") + "/"
        if not source_prefix.startswith("snapshots/"):
            raise SystemExit("Restore prefix must be a snapshots/ backup prefix.")
        target_prefix = "restore-drill/" + uuid.uuid4().hex + "/"
    listed = list(objects(s3, source_bucket, source_prefix))
    if not listed:
        raise SystemExit("No source objects found; refusing an empty backup/restore drill.")
    total_bytes = sum(int(item["Size"]) for item in listed)
    print(f"action={args.action} objects={len(listed)} bytes={total_bytes} execute={args.execute}")
    print(f"target_prefix={target_prefix}")
    if not args.execute:
        return
    for item in listed:
        key = item["Key"]
        relative = key[len(source_prefix):]
        target = target_prefix + relative
        s3.copy_object(
            Bucket=destination_bucket,
            Key=target,
            CopySource={"Bucket": source_bucket, "Key": key},
        )
        actual = s3.head_object(Bucket=destination_bucket, Key=target)
        if int(actual["ContentLength"]) != int(item["Size"]):
            raise RuntimeError("Object backup/restore size verification failed.")
    print(f"verified_objects={len(listed)} elapsed_seconds={time.monotonic()-started:.2f}")


if __name__ == "__main__":
    main()
