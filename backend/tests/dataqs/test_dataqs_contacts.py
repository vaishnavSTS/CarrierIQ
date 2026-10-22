"""How STS reaches each carrier: its account owner keeps it current; STS sees it on cases."""

from fastapi.testclient import TestClient

from app.models import User
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
