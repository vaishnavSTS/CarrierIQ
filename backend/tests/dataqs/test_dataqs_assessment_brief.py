"""What STS staff check before assessing: the client's users, whether STS verified the carrier,
and other requests on the same inspection. None of it is sent to the client."""

from fastapi.testclient import TestClient

from app.models import User
from tests.dataqs.helpers import ISSUE, create_case, log_in, staff_case


def test_staff_see_the_client_and_other_requests_on_the_inspection(
    api: TestClient, world: dict[str, User]
) -> None:
    log_in(api, "owner@acme.test")
    brakes = create_case(api, key="brief-1")
    lamp = create_case(api, key="brief-2", issues=[{**ISSUE, "violation_index": 0}])

    log_in(api, "analyst@sts.test")
    case = staff_case(api, brakes["id"])
    users = {u["email"]: u for u in case["client_users"]}
    assert users["owner@acme.test"]["role"] == "Account owner"
    assert users["viewer@acme.test"]["role"] == "Viewer"
    assert case["carrier_verified"] is True
    [other] = case["related_cases"]
    assert (other["id"], other["same_company"], other["issues"]) == (
        lamp["id"],
        True,
        ["393.9A"],
    )

    log_in(api, "owner@acme.test")
    mine = api.get(f"/api/v1/portal/dataqs/cases/{brakes['id']}").json()
    assert (mine["client_users"], mine["carrier_verified"], mine["related_cases"]) == (
        None,
        None,
        None,
    )
