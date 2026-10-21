"""DataQs Phase 5 through the API: agency correspondence, decisions, appeals, reopenings and
deadlines. Only recorded agency events move the case; earlier cycles are never overwritten."""

from datetime import UTC, datetime, timedelta

import httpx
from fastapi.testclient import TestClient

from app.models import User
from tests.dataqs.helpers import (
    ISSUE,
    approve,
    approved_case,
    assess,
    build,
    confirm_filing,
    create_case,
    log_in,
    staff_case,
    start_filing,
    submit,
    upload,
)

TWO_ISSUES = [{**ISSUE, "violation_index": 0}, ISSUE]
GROUNDS = (
    "The reviewer relied on the officer's note alone; the shop record from the morning of the "
    "inspection shows the pushrod stroke within limits, which the decision did not address."
)


def ago(minutes: float) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes)).isoformat()


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _filed(api: TestClient, issues: list[dict] | None = None) -> dict:
    """A case filed with DataQs 8 minutes ago (just after the approval), as STS staff see it."""
    if issues:
        log_in(api, "owner@acme.test")
        case = create_case(api, key="two", issues=issues)
        upload(api, case)
        submit(api, api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json())
        log_in(api, "analyst@sts.test")
        built = build(api, assess(api, staff_case(api, case["id"]), "READY_TO_PREPARE").json())
        log_in(api, "owner@acme.test")
        carrier = api.get(f"/api/v1/portal/dataqs/cases/{built.json()['id']}").json()
        assert approve(api, carrier, carrier["packages"][0]).status_code == 200
        log_in(api, "analyst@sts.test")
        case = staff_case(api, case["id"])
    else:
        case = approved_case(api)
    attempt = start_filing(api, case).json()["attempts"][-1]["id"]
    filed = confirm_filing(api, case, attempt, filed_at=ago(8))
    assert filed.status_code == 200, filed.text
    return filed.json()


def _record(api: TestClient, case: dict, kind: str, minutes_ago: float, **extra: object):
    return api.post(
        f"/api/v1/dataqs/cases/{case['id']}/correspondence",
        json={
            "expected_version": case["row_version"],
            "kind": kind,
            "text": extra.pop("text", f"{kind} as shown in DataQs"),
            "occurred_at": ago(minutes_ago),
            **extra,
        },
    )


def _ok(response: httpx.Response) -> dict:
    assert response.status_code == 200, response.text
    return response.json()


def _clock(case: dict, clock_type: str) -> dict | None:
    return next((c for c in case["clocks"] if c["clock_type"] == clock_type), None)


def _file_again(api: TestClient, case: dict, gov_id: str) -> dict:
    """The carrier approves the current package and STS files it (an appeal)."""
    log_in(api, "owner@acme.test")
    carrier = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    assert approve(api, carrier, carrier["packages"][0]).status_code == 200
    log_in(api, "analyst@sts.test")
    case = staff_case(api, case["id"])
    attempt = start_filing(api, case, key=f"file-{gov_id}").json()["attempts"][-1]["id"]
    version = case["packages"][0]["package_version"]
    return _ok(
        confirm_filing(api, case, attempt, gov_id=gov_id, package_version=version, filed_at=ago(4))
    )


def test_filing_starts_the_agency_review_clock(api: TestClient, world: dict[str, User]) -> None:
    case = _filed(api)
    review = _clock(case, "AGENCY_REVIEW")
    assert review is not None and review["budget_days"] == 21 and not review["paused"]
    assert parse(review["due_at"]) - parse(review["base_at"]) == timedelta(days=21)
    assert case["next_deadline_label"] == "Agency decision expected"
    assert [c["opened_reason"] for c in case["review_cycles"]] == ["First filing"]


def test_an_information_request_pauses_review_and_the_answer_resumes_it(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _filed(api)
    asked = _ok(_record(api, case, "INFO_REQUEST", 6, text="Send the shop's brake record."))
    review = _clock(asked, "AGENCY_REVIEW")
    assert review is not None and review["paused"] and review["due_at"] is None
    answer_by = _clock(asked, "REQUESTER_INFO")
    assert answer_by is not None
    assert parse(answer_by["due_at"]) - parse(answer_by["base_at"]) == timedelta(days=14)
    task = next(t for t in asked["tasks"] if t["kind"] == "ANSWER_INFO_REQUEST")
    assert task["detail"] == "Send the shop's brake record."  # the exact question
    assert asked["action_owner"] == "STS"

    answered = _ok(_record(api, asked, "INFO_RESPONSE", 2))
    review = _clock(answered, "AGENCY_REVIEW")
    assert review is not None and not review["paused"]
    # 21 days plus the 4 minutes the clock was paused
    extra = parse(review["due_at"]) - parse(review["base_at"]) - timedelta(days=21)
    assert abs(extra - timedelta(minutes=4)) < timedelta(seconds=5)
    assert _clock(answered, "REQUESTER_INFO") is None
    assert answered["action_owner"] == "AGENCY"


def test_a_partial_decision_verifies_the_corrected_issue_and_opens_the_appeal_window(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _filed(api, TWO_ISSUES)
    lamp, brakes = (i["id"] for i in case["issues"])
    decided = _ok(
        _record(
            api,
            case,
            "DECISION",
            10,
            decision={
                "issue_outcomes": {str(lamp): "CORRECTED", str(brakes): "NOT_CORRECTED"},
                "decided_by": "Officer A. Reyes",
                "reasons": "The lamp record is supported; the brake reading is not.",
                "appeal_instructions": "Request reconsideration within 30 days.",
            },
        )
    )
    assert (decided["work_status"], decided["outcome"]) == ("VERIFICATION", "PARTIAL_CORRECTION")
    outcomes = {i["id"]: i["outcome"] for i in decided["issues"]}
    assert outcomes == {lamp: "FULL_CORRECTION", brakes: "NO_CORRECTION"}
    [cycle] = decided["review_cycles"]
    assert (cycle["outcome"], cycle["decided_by"]) == ("PARTIAL_CORRECTION", "Officer A. Reyes")
    appeal = _clock(decided, "APPEAL")
    assert appeal is not None
    # 30 days from when the decision was issued, not from when STS recorded it
    assert parse(appeal["base_at"]) < datetime.now(UTC) - timedelta(minutes=9)
    assert parse(appeal["due_at"]) - parse(appeal["base_at"]) == timedelta(days=30)
    assert {t["kind"] for t in decided["tasks"]} >= {"VERIFY_CORRECTION", "APPEAL_DECISION"}
    assert decided["can_propose_review"] is True

    log_in(api, "owner@acme.test")
    carrier = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    titles = [event["title"] for event in carrier["timeline"]]
    assert "Decision on the initial review: partly corrected" in titles


def test_appeal_goes_through_review_package_and_approval_then_files_the_next_stage(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _filed(api)
    [brakes] = (i["id"] for i in case["issues"])
    denied = _ok(
        _record(
            api,
            case,
            "DECISION",
            5,
            decision={"issue_outcomes": {str(brakes): "NOT_CORRECTED"}, "decided_by": "Lt. Moss"},
        )
    )
    assert denied["work_status"] == "STAFF_REVIEW"

    too_short = api.post(
        f"/api/v1/dataqs/cases/{case['id']}/review-requests",
        json={
            "expected_version": denied["row_version"],
            "grounds": "Wrong.",
            "issue_ids": [brakes],
        },
    )
    assert too_short.status_code == 422
    proposed = _ok(
        api.post(
            f"/api/v1/dataqs/cases/{case['id']}/review-requests",
            json={
                "expected_version": denied["row_version"],
                "grounds": GROUNDS,
                "issue_ids": [brakes],
            },
        )
    )
    appeal_cycle = proposed["review_cycles"][-1]
    assert (appeal_cycle["level"], appeal_cycle["submitted_at"]) == ("RECONSIDERATION", None)
    assert appeal_cycle["grounds"] == GROUNDS
    assert build(api, proposed).status_code == 409  # the appeal needs its own assessment first

    built = build(api, _ok(assess(api, proposed, "READY_TO_PREPARE")), narrative=GROUNDS)
    package = _ok(built)["packages"][0]
    assert (package["package_version"], package["manifest"]["review_level"]) == (
        2,
        "RECONSIDERATION",
    )

    filed = _file_again(api, _ok(built), "RDR-2026-001234")
    assert (filed["work_status"], filed["review_level"]) == ("MONITORING", "RECONSIDERATION")
    assert [(c["level"], c["submitted_at"] is not None) for c in filed["review_cycles"]] == [
        ("INITIAL", True),
        ("RECONSIDERATION", True),
    ]
    assert _clock(filed, "APPEAL") is None  # the appeal was filed in time
    review = _clock(filed, "AGENCY_REVIEW")
    assert review is not None and review["budget_days"] == 21

    # The same officer decides the reconsideration: flagged for STS.
    again = _ok(
        _record(
            api,
            filed,
            "DECISION",
            2,
            decision={"issue_outcomes": {str(brakes): "NOT_CORRECTED"}, "decided_by": "lt. moss"},
        )
    )
    assert again["review_cycles"][-1]["independence_concern"]
    assert any(t["kind"] == "INDEPENDENCE_CONCERN" for t in again["tasks"])
    log_in(api, "owner@acme.test")
    carrier = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    assert carrier["review_cycles"][-1]["independence_concern"] is None  # STS only


def test_procedural_closure_is_not_a_denial_and_a_reopening_gets_a_full_period(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _filed(api)
    closed = _ok(_record(api, case, "DECISION", 5, decision={"procedural_reason": "NO_RESPONSE"}))
    assert (closed["outcome"], closed["work_status"]) == ("PROCEDURAL_CLOSURE", "STAFF_REVIEW")
    assert closed["can_propose_review"] is False and _clock(closed, "APPEAL") is None
    assert any(t["kind"] == "PROCEDURAL_CLOSURE" for t in closed["tasks"])

    reopened = _ok(
        _record(
            api,
            closed,
            "REOPENING",
            3,
            reopening={"mode": "SAME_LEVEL", "reason": "Requested record supplied after closure"},
        )
    )
    first, second = reopened["review_cycles"]
    assert (first["outcome"], second["level"], second["cycle_number"]) == (
        "PROCEDURAL_CLOSURE",
        "INITIAL",
        2,
    )
    assert second["parent_cycle_id"] == first["id"]
    assert (reopened["work_status"], reopened["outcome"]) == ("MONITORING", None)
    review = _clock(reopened, "AGENCY_REVIEW")
    assert review is not None and review["budget_days"] == 21  # a fresh full period


def test_new_evidence_at_appeal_returns_the_request_to_initial_review(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _filed(api)
    [brakes] = (i["id"] for i in case["issues"])
    denied = _ok(
        _record(
            api, case, "DECISION", 5, decision={"issue_outcomes": {str(brakes): "NOT_CORRECTED"}}
        )
    )
    returned = _ok(
        _record(
            api,
            denied,
            "REOPENING",
            3,
            reopening={
                "mode": "RETURN_TO_INITIAL",
                "reason": "New ELD data submitted with the appeal",
            },
        )
    )
    levels = [(c["level"], c["cycle_number"]) for c in returned["review_cycles"]]
    assert levels == [("INITIAL", 1), ("INITIAL", 2)]
    assert returned["issues"][0]["outcome"] is None  # back under review
    assert returned["review_cycles"][0]["outcome"] == "NO_CORRECTION"  # history kept


def test_a_final_review_denial_closes_the_escalation_route(
    api: TestClient, world: dict[str, User]
) -> None:
    case = _filed(api)
    [brakes] = (i["id"] for i in case["issues"])
    outcome = {"issue_outcomes": {str(brakes): "NOT_CORRECTED"}}
    stage = _ok(_record(api, case, "DECISION", 5, decision={**outcome, "decided_by": "Moss"}))
    for level, gov_id, decided_by in (("RECONSIDERATION", "R1", "Diaz"), ("FINAL", "F1", "Park")):
        stage = _ok(
            api.post(
                f"/api/v1/dataqs/cases/{case['id']}/review-requests",
                json={
                    "expected_version": stage["row_version"],
                    "grounds": GROUNDS,
                    "issue_ids": [brakes],
                },
            )
        )
        built = build(api, _ok(assess(api, stage, "READY_TO_PREPARE")), narrative=GROUNDS + level)
        stage = _file_again(api, _ok(built), gov_id)
        assert stage["review_level"] == level
        stage = _ok(
            _record(api, stage, "DECISION", 2, decision={**outcome, "decided_by": decided_by})
        )

    assert (stage["work_status"], stage["outcome"]) == ("CLOSED", "NO_CORRECTION")
    assert stage["can_propose_review"] is False
    assert _clock(stage, "APPEAL") is None
    assert [c["level"] for c in stage["review_cycles"]] == ["INITIAL", "RECONSIDERATION", "FINAL"]


def test_only_an_sts_admin_overrides_a_deadline(api: TestClient, world: dict[str, User]) -> None:
    case = _filed(api)
    review = _clock(case, "AGENCY_REVIEW")
    assert review is not None
    body = {
        "expected_version": case["row_version"],
        "due_at": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        "reason": "Texas counts business days for this stage",
    }
    url = f"/api/v1/dataqs/cases/{case['id']}/clocks/{review['id']}/override"
    assert api.post(url, json=body).status_code == 403  # analyst

    log_in(api, "admin@sts.test")
    overridden = _ok(api.post(url, json=body))
    review = _clock(overridden, "AGENCY_REVIEW")
    assert review is not None
    assert review["override_reason"] == "Texas counts business days for this stage"
    assert review["confidence"] == "MEDIUM"


def test_agency_events_are_staff_only_and_need_a_filed_request(
    api: TestClient, world: dict[str, User]
) -> None:
    case = approved_case(api)  # approved, not filed yet
    assert _record(api, case, "INFO_REQUEST", 1).status_code == 409
    log_in(api, "owner@acme.test")
    assert _record(api, case, "OTHER", 1).status_code == 403
