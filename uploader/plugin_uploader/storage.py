"""Cloudflare R2 upload client (S3-compatible). Two buckets: private (zips, manifests), public (thumbnails)."""

from __future__ import annotations

from dataclasses import dataclass

import boto3


@dataclass(frozen=True)
class R2Settings:
    endpoint_url: str
    access_key_id: str
    secret_access_key: str
    private_bucket: str
    public_bucket: str


class R2Storage:
    def __init__(self, settings: R2Settings, client=None) -> None:
        self.settings = settings
        self.client = client or boto3.client(
            "s3",
            endpoint_url=settings.endpoint_url,
            aws_access_key_id=settings.access_key_id,
            aws_secret_access_key=settings.secret_access_key,
            region_name="auto",
        )

    def put_private(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.settings.private_bucket, Key=key, Body=data, ContentType=content_type
        )

    def put_public(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.settings.public_bucket, Key=key, Body=data, ContentType=content_type
        )
