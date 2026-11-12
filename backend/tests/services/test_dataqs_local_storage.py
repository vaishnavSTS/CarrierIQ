"""DataQs evidence files in a folder on the server (DATAQS_STORAGE_DIR)."""

from pathlib import Path

import pytest

from app.core.config import Settings
from app.core.exceptions import DataQsStorageUnavailableError
from app.services import dataqs_evidence_storage
from app.services.dataqs_evidence_storage import LocalEvidenceStorage


def test_a_saved_file_reads_back_at_its_key(tmp_path: Path) -> None:
    storage = LocalEvidenceStorage(tmp_path)
    storage.put("org-1/case-2/filing/abc.pdf", b"%PDF-1.7", "application/pdf")

    assert storage.get("org-1/case-2/filing/abc.pdf") == b"%PDF-1.7"
    # Same layout as the bucket, so a bucket's files can be copied into the folder as they are.
    assert (tmp_path / "org-1" / "case-2" / "filing" / "abc.pdf").read_bytes() == b"%PDF-1.7"
    # No temporary files left behind
    assert [p.name for p in (tmp_path / "org-1" / "case-2" / "filing").iterdir()] == ["abc.pdf"]


def test_saving_again_replaces_the_file(tmp_path: Path) -> None:
    storage = LocalEvidenceStorage(tmp_path)
    storage.put("org-1/case-2/a.png", b"one", "image/png")
    storage.put("org-1/case-2/a.png", b"two", "image/png")

    assert storage.get("org-1/case-2/a.png") == b"two"


def test_a_missing_file_is_a_storage_error(tmp_path: Path) -> None:
    with pytest.raises(DataQsStorageUnavailableError):
        LocalEvidenceStorage(tmp_path).get("org-1/case-2/missing.pdf")


@pytest.mark.parametrize("key", ["", "../outside.pdf", "org-1/../../outside.pdf", "/etc/passwd"])
def test_a_key_outside_the_folder_is_refused(tmp_path: Path, key: str) -> None:
    storage = LocalEvidenceStorage(tmp_path / "files")
    with pytest.raises(ValueError):
        storage.put(key, b"x", "application/pdf")
    with pytest.raises(ValueError):
        storage.get(key)
    assert not (tmp_path / "outside.pdf").exists()


def test_the_folder_is_used_when_it_is_set(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        dataqs_storage_dir=str(tmp_path),
        dataqs_storage_endpoint="https://bucket.example",
        dataqs_storage_access_key_id="id",
        dataqs_storage_secret_access_key="secret",
    )
    monkeypatch.setattr(dataqs_evidence_storage, "get_settings", lambda: settings)

    storage = dataqs_evidence_storage.get_evidence_storage()

    assert isinstance(storage, LocalEvidenceStorage)
    assert storage.root == tmp_path.resolve()


def test_uploads_are_refused_when_nothing_is_set(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(dataqs_storage_dir=None, dataqs_storage_endpoint=None)
    monkeypatch.setattr(dataqs_evidence_storage, "get_settings", lambda: settings)

    with pytest.raises(DataQsStorageUnavailableError):
        dataqs_evidence_storage.get_evidence_storage()
