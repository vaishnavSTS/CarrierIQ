"""Private storage for DataQs evidence files: a folder on the server (DATAQS_STORAGE_DIR, our own
VM), or a bucket over the S3 protocol (Supabase Storage until the move to the VM).

Both use the same object keys (org-1/case-2/<hex>.pdf), so the files of a bucket can be copied
into the folder as they are. The bucket is private and the keys stay on the backend. Files are
never served by a storage link: they always go through the API, which checks access
(dataqs_access.py) and records each download in the case's audit trail.
"""

import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings
from app.core.exceptions import DataQsStorageUnavailableError


class EvidenceStorage(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...

    def get(self, key: str) -> bytes: ...


class S3EvidenceStorage:
    def __init__(
        self, endpoint: str, region: str, access_key_id: str, secret_access_key: str, bucket: str
    ) -> None:
        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=Config(
                s3={"addressing_style": "path"},
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )

    def put(self, key: str, data: bytes, content_type: str) -> None:
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        except (BotoCoreError, ClientError) as exc:
            raise DataQsStorageUnavailableError("Could not save the file; try again") from exc

    def get(self, key: str) -> bytes:
        try:
            body: bytes = self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except (BotoCoreError, ClientError) as exc:
            raise DataQsStorageUnavailableError("Could not read the file; try again") from exc
        return body


class LocalEvidenceStorage:
    """Files under one folder, at their object key. Written to a temporary file first and then
    renamed, so a file is never seen half-written."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not key or not path.is_relative_to(self.root) or path == self.root:
            raise ValueError(f"Invalid evidence key: {key!r}")
        return path

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".upload-")
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, path)
            except BaseException:
                Path(tmp).unlink(missing_ok=True)
                raise
        except OSError as exc:
            raise DataQsStorageUnavailableError("Could not save the file; try again") from exc

    def get(self, key: str) -> bytes:
        try:
            return self._path(key).read_bytes()
        except OSError as exc:
            raise DataQsStorageUnavailableError("Could not read the file; try again") from exc


@lru_cache
def _local_storage(root: str) -> LocalEvidenceStorage:
    return LocalEvidenceStorage(root)


@lru_cache
def _s3_storage() -> S3EvidenceStorage:
    settings = get_settings()
    assert settings.dataqs_storage_endpoint
    assert settings.dataqs_storage_access_key_id
    assert settings.dataqs_storage_secret_access_key
    return S3EvidenceStorage(
        settings.dataqs_storage_endpoint,
        settings.dataqs_storage_region,
        settings.dataqs_storage_access_key_id,
        settings.dataqs_storage_secret_access_key,
        settings.dataqs_storage_bucket,
    )


def get_evidence_storage() -> EvidenceStorage:
    """FastAPI dependency. Tests replace it with an in-memory store."""
    settings = get_settings()
    if not settings.dataqs_storage_enabled:
        raise DataQsStorageUnavailableError("Evidence uploads are not set up on this server yet")
    if settings.dataqs_storage_dir:
        return _local_storage(settings.dataqs_storage_dir)
    return _s3_storage()
