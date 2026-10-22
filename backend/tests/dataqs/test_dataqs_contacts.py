"""How STS reaches each carrier: its account owner keeps it current; STS sees it on cases."""

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import DataQsCarrierContact, User
from tests.dataqs.helpers import USDOT, log_in, staff_case, submitted_case

CONTACT = {"email": "safety@acme.test", "phone": "+1 (555) 010-2030"}
URL = f"/api/v1/portal/dataqs/contacts/{USDOT}"


def test_the_account_owner_keeps_the_contact_and_sts_sees_it_on_cases(
    api: TestClient, world: dict[str, User]
) -> None:
    case_id = submitted_case(api)["id"]

    log_in(api, "owner@acme.test")
    empty = api.get("/api/v1/portal/dataqs/contacts").json()
    assert empty["can_edit"] is True
    [carrier] = empty["carriers"]
    assert (carrier["usdot_number"], carrier["email"]) == (USDOT, None)

    saved = api.put(URL, json=CONTACT)
    assert saved.status_code == 200, saved.text
    [carrier] = saved.json()["carriers"]
    assert carrier["phone"] == CONTACT["phone"] and carrier["updated_by_name"] == "Owner"
    assert carrier["carrier_name"] == "ACME HAULING LLC"

    # The carrier doesn't need its own details on the case; STS staff do.
    assert api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()["carrier_contact"] is None
    log_in(api, "analyst@sts.test")
    contact = staff_case(api, case_id)["carrier_contact"]
    assert (contact["email"], contact["phone"]) == (CONTACT["email"], CONTACT["phone"])

    # Updating replaces it.
    log_in(api, "owner@acme.test")
    again = api.put(URL, json={**CONTACT, "phone": "555-010-9999"})
    [carrier] = again.json()["carriers"]
    assert carrier["phone"] == "555-010-9999"


def test_only_the_account_owner_of_a_verified_carrier_can_change_it(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "viewer@acme.test")
    assert api.get("/api/v1/portal/dataqs/contacts").json()["can_edit"] is False
    assert api.put(URL, json=CONTACT).status_code == 403

    log_in(api, "owner@other.test")  # Other Co holds no verified carrier
    assert api.get("/api/v1/portal/dataqs/contacts").json()["carriers"] == []
    assert api.put(URL, json=CONTACT).status_code == 403


def test_contact_details_are_checked(api: TestClient, world: dict[str, User]) -> None:
    log_in(api, "owner@acme.test")
    assert api.put(URL, json={**CONTACT, "email": "not-an-email"}).status_code == 422
    assert api.put(URL, json={**CONTACT, "phone": "call me"}).status_code == 422
    assert (
        api.put(
            URL,
            json={**CONTACT, "password": "new-password", "clear_password": True},
        ).status_code
        == 422
    )


def test_password_is_encrypted_and_only_owner_sees_saved_status(
    api: TestClient,
    db: Session,
    world: dict[str, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case_id = submitted_case(api)["id"]
    key = Fernet.generate_key()
    monkeypatch.setattr(get_settings(), "dataqs_credential_encryption_key", SecretStr(key.decode()))
    password = "private-FMCSA-password"
    log_in(api, "owner@acme.test")

    saved = api.put(URL, json={**CONTACT, "password": password})
    assert saved.status_code == 200, saved.text
    [carrier] = saved.json()["carriers"]
    assert carrier["password_saved"] is True
    assert password not in saved.text

    contact = db.scalar(select(DataQsCarrierContact))
    assert contact is not None
    assert contact.password_encrypted is not None
    assert contact.password_encrypted != password
    assert Fernet(key).decrypt(contact.password_encrypted.encode()).decode() == password

    log_in(api, "viewer@acme.test")
    [viewer_contact] = api.get("/api/v1/portal/dataqs/contacts").json()["carriers"]
    assert viewer_contact["password_saved"] is None

    log_in(api, "analyst@sts.test")
    staff_contact = staff_case(api, case_id)["carrier_contact"]
    assert staff_contact["password_saved"] is None


def test_password_save_requires_encryption_key(
    api: TestClient,
    world: dict[str, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "dataqs_credential_encryption_key", None)
    log_in(api, "owner@acme.test")

    response = api.put(URL, json={**CONTACT, "password": "private-FMCSA-password"})
    assert response.status_code == 503
    assert "DATAQS_CREDENTIAL_ENCRYPTION_KEY" in response.json()["error"]["message"]


def test_password_can_be_replaced_or_cleared(
    api: TestClient,
    db: Session,
    world: dict[str, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key = Fernet.generate_key()
    monkeypatch.setattr(get_settings(), "dataqs_credential_encryption_key", SecretStr(key.decode()))
    log_in(api, "owner@acme.test")

    first = api.put(URL, json={**CONTACT, "password": "first-password"})
    assert first.status_code == 200
    [first_contact] = first.json()["carriers"]
    assert first_contact["password_saved"] is True

    replaced = api.put(URL, json={**CONTACT, "password": "second-password"})
    assert replaced.status_code == 200
    contact = db.scalar(select(DataQsCarrierContact))
    assert contact is not None and contact.password_encrypted is not None
    assert Fernet(key).decrypt(contact.password_encrypted.encode()).decode() == "second-password"

    preserved = api.put(URL, json=CONTACT)
    assert preserved.status_code == 200
    assert Fernet(key).decrypt(contact.password_encrypted.encode()).decode() == "second-password"

    cleared = api.put(URL, json={**CONTACT, "clear_password": True})
    assert cleared.status_code == 200
    [cleared_contact] = cleared.json()["carriers"]
    assert cleared_contact["password_saved"] is False
    assert contact.password_encrypted is None
