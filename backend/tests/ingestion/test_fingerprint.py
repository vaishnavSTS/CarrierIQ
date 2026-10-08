import hashlib

from app.ingestion.fingerprint import payload_hash
from tests.ingestion.helpers import load_census_rows


def test_hash_is_sha256_of_canonical_json() -> None:
    expected = hashlib.sha256(b'{"a":"1","b":"2"}').hexdigest()

    assert payload_hash({"b": "2", "a": "1"}) == expected


def test_key_order_does_not_change_the_hash() -> None:
    row = load_census_rows()[0]
    reversed_row = dict(reversed(list(row.items())))

    assert payload_hash(row) == payload_hash(reversed_row)


def test_any_value_change_changes_the_hash() -> None:
    row = load_census_rows()[0]
    changed = {**row, "phy_street": "456 NEW STREET"}

    assert payload_hash(row) != payload_hash(changed)


def test_added_or_removed_field_changes_the_hash() -> None:
    row = load_census_rows()[0]
    without_fax = {k: v for k, v in row.items() if k != "fax"}

    assert payload_hash(row) != payload_hash(without_fax)
