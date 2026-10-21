"""DataQs Phase 3 through the API: STS assigns and assesses, builds a package, the carrier approves
one exact package; any material edit needs a new approval."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsAuditEvent, User
from app.services.dataqs_assessment_service import CHECK_KEYS
from app.services.dataqs_case_service import CONSENT_TERMS_VERSION
from app.services.dataqs_package_service import PACKAGE_TERMS_VERSION
from tests.dataqs.helpers import create_case, log_in, upload

ALL_PASS = {key: {"result": "PASS", "note": None} for key in CHECK_KEYS}
NARRATIVE = (
    "The carrier's shop record shows the brakes were measured and adjusted within limits on the "
    "morning of the inspection. We request removal of violation 396.3A1BOS."
)


def _submitted(api: TestClient) -> dict:
    """The carrier's owner opens a case, uploads a file and submits it to STS."""
    log_in(api, "owner@acme.test")
    case = create_case(api)
    upload(api, case)
    case = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    response = api.post(
        f"/api/v1/portal/dataqs/cases/{case['id']}/submit",
        json={
            "expected_version": case["row_version"],
            "signer_name": "Pat Owner",
            "terms_version": CONSENT_TERMS_VERSION,
            "accept": True,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _staff_case(api: TestClient, case_id: int) -> dict:
    return api.get(f"/api/v1/dataqs/cases/{case_id}").json()


def _assess(api: TestClient, case: dict, outcome: str, **extra: object):
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/assessments",
        json={
            "expected_version": case["row_version"],
            "outcome": outcome,
            "checks": ALL_PASS,
            **extra,
        },
    )


def _build(api: TestClient, case: dict, narrative: str = NARRATIVE):
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/packages",
        json={
            "expected_version": case["row_version"],
            "narrative": narrative,
            "evidence_ids": [e["id"] for e in case["evidence"]],
            "references": ["49 CFR 396.3(a)(1)"],
        },
    )


def _approve(api: TestClient, case: dict, package: dict):
    return api.post(
        f"/api/v1/portal/dataqs/cases/{case['id']}/approvals",
        json={
            "expected_version": case["row_version"],
            "package_id": package["id"],
            "package_hash": package["manifest_hash"],
            "signer_name": "Pat Owner",
            "terms_version": PACKAGE_TERMS_VERSION,
            "accept": True,
        },
    )


def _ready_package(api: TestClient) -> tuple[int, dict]:
    """A case assessed as ready, with package v1 built and waiting for the carrier."""
    case_id = _submitted(api)["id"]
    log_in(api, "analyst@sts.test")
    assessed = _assess(api, _staff_case(api, case_id), "READY_TO_PREPARE")
    assert assessed.status_code == 200, assessed.text
    built = _build(api, assessed.json())
    assert built.status_code == 200, built.text
    return case_id, built.json()


def test_staff_assess_build_and_the_carrier_approves_the_exact_package(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case_id = _submitted(api)["id"]
    log_in(api, "analyst@sts.test")
    case = _staff_case(api, case_id)
    assert case["can_assess"] and case["can_assign"] and not case["can_build_package"]
    assert {c["key"] for c in case["assessment_checks"]} == CHECK_KEYS

    owner = api.post(
        f"/api/v1/dataqs/cases/{case_id}/owner",
        json={"expected_version": case["row_version"], "owner_id": world["staff2"].id},
    )
    assert owner.status_code == 200, owner.text
    assert owner.json()["owner_name"] == "Admin"

    assessed = _assess(api, owner.json(), "READY_TO_PREPARE", internal_note="Strong record.")
    assert assessed.status_code == 200, assessed.text
    case = assessed.json()
    assert (case["work_status"], case["can_build_package"]) == ("STAFF_REVIEW", True)
    assert [t["kind"] for t in case["tasks"]] == ["PREPARE_PACKAGE"]

    built = _build(api, case)
    assert built.status_code == 200, built.text
    case = built.json()
    assert (case["work_status"], case["action_owner"]) == ("AWAITING_APPROVAL", "CARRIER")
    [package] = case["packages"]
    manifest = package["manifest"]
    assert package["package_version"] == manifest["package_version"] == 1
    assert manifest["evidence"][0]["sha256"] == case["evidence"][0]["sha256"]
    assert manifest["issues"][0]["violation_code"] == "396.3A1BOS"
    assert manifest["representative"]["company"] == "Sky Transport Solutions"
    assert manifest["representative"]["specialist"] == "Admin"
    assert len(package["manifest_hash"]) == 64

    log_in(api, "owner@acme.test")
    carrier_view = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert carrier_view["can_approve"] is True
    assert carrier_view["assessments"][0]["internal_note"] is None  # STS only
    assert [t["kind"] for t in carrier_view["tasks"]] == ["APPROVE_PACKAGE"]
    approved = _approve(api, carrier_view, carrier_view["packages"][0])
    assert approved.status_code == 200, approved.text
    case = approved.json()
    assert (case["work_status"], case["action_owner"]) == ("READY_TO_FILE", "STS")
    assert case["packages"][0]["approved"] is True
    assert _approve(api, case, case["packages"][0]).status_code == 200  # a repeat changes nothing

    actions = db.scalars(
        select(DataQsAuditEvent.action)
        .where(DataQsAuditEvent.case_id == case_id)
        .order_by(DataQsAuditEvent.id)
    ).all()
    assert actions[-4:] == ["owner.changed", "case.assessed", "package.built", "package.approved"]


def test_a_material_edit_replaces_the_package_and_needs_a_new_approval(
    api: TestClient, world: dict[str, User]
) -> None:
    case_id, case = _ready_package(api)
    log_in(api, "owner@acme.test")
    v1 = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert _approve(api, v1, v1["packages"][0]).status_code == 200

    log_in(api, "analyst@sts.test")
    approved = _staff_case(api, case_id)
    same = _build(api, approved)  # identical content: nothing material changed
    assert same.json()["work_status"] == "READY_TO_FILE"
    assert [p["package_version"] for p in same.json()["packages"]] == [1]

    edited = _build(api, same.json(), narrative=NARRATIVE + " The shop invoice is attached.")
    assert edited.status_code == 200, edited.text
    case = edited.json()
    assert case["work_status"] == "AWAITING_APPROVAL"
    v2, old = case["packages"]  # staff see every version, newest first
    assert (v2["package_version"], old["package_version"]) == (2, 1)
    assert old["invalidated_at"] is not None and old["approved"] is False
    assert v2["manifest_hash"] != old["manifest_hash"]

    log_in(api, "owner@acme.test")
    carrier_view = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert [p["package_version"] for p in carrier_view["packages"]] == [2]  # only the current
    stale = _approve(api, carrier_view, old)
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "dataqs_stale_version"
    assert _approve(api, carrier_view, carrier_view["packages"][0]).status_code == 200


def test_evidence_needed_goes_back_to_the_carrier_and_returns(
    api: TestClient, world: dict[str, User]
) -> None:
    case_id = _submitted(api)["id"]
    log_in(api, "analyst@sts.test")
    no_message = _assess(api, _staff_case(api, case_id), "EVIDENCE_NEEDED")
    assert no_message.status_code == 422
    asked = _assess(
        api,
        _staff_case(api, case_id),
        "EVIDENCE_NEEDED",
        carrier_message="Please upload the full inspection report.",
        internal_note="Check the officer's notes.",
    )
    assert asked.status_code == 200, asked.text
    assert asked.json()["work_status"] == "EVIDENCE_NEEDED"

    log_in(api, "owner@acme.test")
    case = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert case["missing_items"][0] == "STS asked: Please upload the full inspection report."
    assert case["assessments"][0]["internal_note"] is None
    assert case["can_resubmit"] and case["can_upload"]
    assert upload(api, case, name="inspection-report.pdf").status_code == 201
    case = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    back = api.post(
        f"/api/v1/portal/dataqs/cases/{case_id}/resubmit",
        json={"expected_version": case["row_version"]},
    )
    assert back.status_code == 200, back.text
    assert (back.json()["work_status"], back.json()["action_owner"]) == ("STAFF_REVIEW", "STS")

    log_in(api, "analyst@sts.test")
    assert [t["kind"] for t in _staff_case(api, case_id)["tasks"]] == ["ASSESS_CASE"]


def test_ready_needs_every_check_and_no_failed_one(api: TestClient, world: dict[str, User]) -> None:
    case_id = _submitted(api)["id"]
    log_in(api, "analyst@sts.test")
    case = _staff_case(api, case_id)
    assert _build(api, case).status_code == 409  # not assessed as ready yet

    partial = {**ALL_PASS}
    partial.pop("timing")
    response = api.post(
        f"/api/v1/dataqs/cases/{case_id}/assessments",
        json={
            "expected_version": case["row_version"],
            "outcome": "READY_TO_PREPARE",
            "checks": partial,
        },
    )
    assert response.status_code == 422
    failed = {**ALL_PASS, "evidence": {"result": "ISSUE", "note": "No ELD log"}}
    response = api.post(
        f"/api/v1/dataqs/cases/{case_id}/assessments",
        json={
            "expected_version": case["row_version"],
            "outcome": "READY_TO_PREPARE",
            "checks": failed,
        },
    )
    assert response.status_code == 422
    stale = _assess(api, {**case, "row_version": case["row_version"] - 1}, "READY_TO_PREPARE")
    assert stale.status_code == 409


def test_insufficient_basis_closes_the_case(api: TestClient, world: dict[str, User]) -> None:
    case_id = _submitted(api)["id"]
    log_in(api, "analyst@sts.test")
    closed = _assess(
        api,
        _staff_case(api, case_id),
        "INSUFFICIENT_BASIS",
        carrier_message="The repair after the inspection doesn't show the brakes were in limits.",
    )
    assert closed.status_code == 200, closed.text
    case = closed.json()
    assert (case["work_status"], case["tasks"]) == ("CLOSED", [])
    assert not (case["can_assess"] or case["can_upload"] or case["can_assign"])


def test_carrier_asks_for_changes_and_staff_send_it_again(
    api: TestClient, world: dict[str, User]
) -> None:
    case_id, _ = _ready_package(api)
    log_in(api, "owner@acme.test")
    case = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    changes = api.post(
        f"/api/v1/portal/dataqs/cases/{case_id}/package-changes",
        json={"expected_version": case["row_version"], "message": "Mention the shop invoice."},
    )
    assert changes.status_code == 200, changes.text
    assert changes.json()["work_status"] == "STAFF_REVIEW"

    log_in(api, "analyst@sts.test")
    case = _staff_case(api, case_id)
    [task] = case["tasks"]
    assert (task["kind"], task["detail"]) == ("REVISE_PACKAGE", "Mention the shop invoice.")
    resent = _build(api, case)  # unchanged, sent again for approval
    assert resent.json()["work_status"] == "AWAITING_APPROVAL"
    assert [p["package_version"] for p in resent.json()["packages"]] == [1]


def test_who_may_assess_build_and_approve(api: TestClient, world: dict[str, User]) -> None:
    case_id, _ = _ready_package(api)

    log_in(api, "owner@acme.test")
    assert api.get("/api/v1/dataqs/staff").status_code == 403
    case = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert _assess(api, case, "READY_TO_PREPARE").status_code == 403  # staff routes

    log_in(api, "viewer@acme.test")
    viewer = api.get(f"/api/v1/portal/dataqs/cases/{case_id}").json()
    assert viewer["can_approve"] is False
    assert _approve(api, viewer, viewer["packages"][0]).status_code == 403

    log_in(api, "owner@other.test")
    assert _approve(api, case, case["packages"][0]).status_code == 404

    log_in(api, "analyst@sts.test")
    staff_view = _staff_case(api, case_id)
    assert staff_view["can_approve"] is False
    assert _approve(api, staff_view, staff_view["packages"][0]).status_code == 403
    assert {u["full_name"] for u in api.get("/api/v1/dataqs/staff").json()} == {"Analyst", "Admin"}
