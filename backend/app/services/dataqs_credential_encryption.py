"""Encryption for credentials that the DataQs contact workflow explicitly retains."""

from cryptography.fernet import Fernet

from app.core.config import get_settings
from app.core.exceptions import DataQsStorageUnavailableError


def encrypt_dataqs_password(password: str) -> str:
    key = get_settings().dataqs_credential_encryption_key
    if key is None:
        raise DataQsStorageUnavailableError(
            "Set DATAQS_CREDENTIAL_ENCRYPTION_KEY before saving an FMCSA password"
        )
    try:
        return Fernet(key.get_secret_value().encode("ascii")).encrypt(
            password.encode("utf-8")
        ).decode("ascii")
    except (UnicodeEncodeError, ValueError) as exc:
        raise DataQsStorageUnavailableError(
            "DATAQS_CREDENTIAL_ENCRYPTION_KEY must be a valid Fernet key"
        ) from exc
