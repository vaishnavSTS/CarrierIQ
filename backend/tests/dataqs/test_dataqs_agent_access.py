"""Authorizing STS as an agent: instead of passing STS a login code, the carrier approves STS's
associate access request in the FMCSA Portal. STS is told and sends the request, can remind the
carrier, and both sides are emailed when it's approved."""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DataQsOutbox, User
from tests.dataqs.helpers import log_in, staff_case, submitted_case

PHONE = "(209) 555-0123"


def choose(api: TestClient, case_id: int, method: str = "AUTHORIZED_AGENT"):
    return api.put(
        f"/api/v1/portal/dataqs/cases/{case_id}/otp-preference",
        json={"method": method, "phone": PHONE},
    )


def outbox(db: Session, case_id: int, kind: str) -> list[DataQsOutbox]:
    return list(
        db.scalars(
            select(DataQsOutbox).where(DataQsOutbox.case_id == case_id, DataQsOutbox.kind == kind)
        )
    )


def staff_post(api: TestClient, case_id: int, action: str):
    return api.post(f"/api/v1/dataqs/cases/{case_id}/agent-access/{action}")


def tasks(case: dict, kind: str) -> list[dict]:
    return [t for t in case["tasks"] if t["kind"] == kind]


def test_the_whole_flow(api: TestClient, world: dict[str, User], db: Session) -> None:
    case = submitted_case(api)
    log_in(api, "owner@acme.test")
    chosen = choose(api, case["id"])
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["otp_preference"]["method"] == "AUTHORIZED_AGENT"
    assert chosen.json()["agent"]["status"] == "REQUESTED"

    # 1. STS is told, sees it in the queue, and has a task.
    [notice] = outbox(db, case["id"], "NOTICE_AGENT_ACCESS_WANTED")
    assert "asked STS to request authorized access" in notice.payload["subject"]
    log_in(api, "analyst@sts.test")
    queue = api.get("/api/v1/dataqs/cases").json()["cases"]
    assert next(c for c in queue if c["id"] == case["id"])["agent_access"] == "REQUESTED"
    assert tasks(staff_case(api, case["id"]), "REQUEST_FMCSA_ACCESS")
    # Can't remind before sending, and the carrier can't approve what wasn't sent.
    assert staff_post(api, case["id"], "remind").status_code == 409

    # 2. STS sends the request: the carrier is emailed the steps and has a task.
    sent = staff_post(api, case["id"], "sent")
    assert sent.status_code == 200, sent.text
    agent = sent.json()["agent"]
    assert (agent["status"], agent["sent_by_name"]) == ("SENT", "Analyst")
    assert "Pending Account Requests" in agent["approve_steps"]
    assert not tasks(sent.json(), "REQUEST_FMCSA_ACCESS")
    emails = outbox(db, case["id"], "AGENT_ACCESS_REQUESTED")
    assert emails and "Approve Request" in emails[0].payload["text"]
    assert "View Sensitive Company Information" in emails[0].payload["text"]

    # 3. A reminder.
    reminded = staff_post(api, case["id"], "remind")
    assert reminded.status_code == 200 and reminded.json()["agent"]["reminders"] == 1
    assert outbox(db, case["id"], "AGENT_ACCESS_REMINDER")

    # 4. The carrier approves it in the FMCSA Portal and says so: STS is emailed.
    log_in(api, "owner@acme.test")
    mine = api.get(f"/api/v1/portal/dataqs/cases/{case['id']}").json()
    assert tasks(mine, "APPROVE_FMCSA_ACCESS")  # shown to the carrier as a next step
    granted = api.post(f"/api/v1/portal/dataqs/cases/{case['id']}/agent-access/granted")
    assert granted.status_code == 200, granted.text
    assert granted.json()["agent"]["status"] == "GRANTED"
    assert not tasks(granted.json(), "APPROVE_FMCSA_ACCESS")
    [told] = outbox(db, case["id"], "NOTICE_AGENT_ACCESS_GRANTED")
    assert "approved STS's FMCSA Portal access" in told.payload["subject"]
    again = api.post(f"/api/v1/portal/dataqs/cases/{case['id']}/agent-access/granted")
    assert again.status_code == 409

    # Every step is in the audit trail, with who did it.
    log_in(api, "analyst@sts.test")
    audit = {e["action"]: e for e in staff_case(api, case["id"])["audit"]}
    for action in (
        "agent_access.requested_by_carrier",
        "agent_access.request_sent",
        "agent_access.reminded",
        "agent_access.granted",
    ):
        assert action in audit, action
    assert audit["agent_access.request_sent"]["detail"]["client_emailed"] is True
    assert audit["agent_access.reminded"]["detail"]["reminders"] == 1
    assert audit["agent_access.granted"]["detail"]["confirmed_by"] == "client"


def test_staff_confirm_the_access_and_the_carrier_is_told(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = submitted_case(api)
    log_in(api, "owner@acme.test")
    choose(api, case["id"])
    log_in(api, "analyst@sts.test")
    staff_post(api, case["id"], "sent")
    granted = api.post(f"/api/v1/dataqs/cases/{case['id']}/agent-access/granted")
    assert granted.status_code == 200 and granted.json()["agent"]["status"] == "GRANTED"
    assert outbox(db, case["id"], "AGENT_ACCESS_GRANTED")


def test_choosing_another_way_withdraws_an_unsent_request(
    api: TestClient, world: dict[str, User], db: Session
) -> None:
    case = submitted_case(api)
    log_in(api, "owner@acme.test")
    choose(api, case["id"])
    changed = choose(api, case["id"], "TEXT")
    assert changed.status_code == 200 and changed.json()["agent"] is None
    log_in(api, "analyst@sts.test")
    assert not tasks(staff_case(api, case["id"]), "REQUEST_FMCSA_ACCESS")
    assert staff_post(api, case["id"], "sent").status_code == 409  # not their choice now
    actions = [e["action"] for e in staff_case(api, case["id"])["audit"]]
    assert "agent_access.withdrawn" in actions


def test_only_staff_send_and_remind(api: TestClient, world: dict[str, User], db: Session) -> None:
    case = submitted_case(api)
    log_in(api, "owner@acme.test")
    choose(api, case["id"])
    assert staff_post(api, case["id"], "sent").status_code == 403
    log_in(api, "viewer@acme.test")
    path = f"/api/v1/portal/dataqs/cases/{case['id']}/agent-access/granted"
    assert api.post(path).status_code == 403
