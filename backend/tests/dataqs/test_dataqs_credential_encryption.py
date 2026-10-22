"""Encryption behavior for FMCSA passwords retained with DataQs carrier contacts."""

import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr

from app.core.config import get_settings
from app.core.exceptions import DataQsStorageUnavailableError
from app.services.dataqs_credential_encryption import encrypt_dataqs_password


def test_fmcsa_password_is_fernet_encrypted(monkeypatch: pytest.MonkeyPatch) -> None:
    key = Fernet.generate_key()
    monkeypatch.setattr(get_settings(), "dataqs_credential_encryption_key", SecretStr(key.decode()))
    password = "private-FMCSA-password"

    encrypted = encrypt_dataqs_password(password)

    assert encrypted != password
    assert Fernet(key).decrypt(encrypted.encode()).decode() == password


def test_password_cannot_be_saved_without_encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "dataqs_credential_encryption_key", None)

    with pytest.raises(DataQsStorageUnavailableError, match="DATAQS_CREDENTIAL_ENCRYPTION_KEY"):
        encrypt_dataqs_password("private-FMCSA-password")
