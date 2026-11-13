"""Insurance renewal reminders: end dates, who gets them, once only, unsubscribe."""

from collections.abc import Iterator, Sequence
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.main import app
from app.models import Insurance, InsuranceReminder, MonitoredCarrier, OrganizationCarrier
from app.models.enums import DocketPrefix, OrganizationKind, UserRole, UserStatus
from app.services.dataqs_email import Attachment
from app.services.insurance_reminders import (
    email_hash,
    policy_end,
    send_due_reminders,
    stage_for,
)
from tests.dataqs.helpers import make_org, make_user
from tests.factories import make_carrier, make_raw_record

# --- end dates and stages (no database) ----------------------------------------------------


def test_policy_ends_one_calendar_year_later() -> None:
    end = policy_end(date(2025, 9, 23), date(2026, 1, 10))
    assert (end.date, end.days_left) == (date(2026, 9, 23), 256)


def test_policy_seen_on_file_after_its_end_rolls_to_the_next_year() -> None:
    # Up-to-date data (Motus, today) still shows it on file after Sep 23, 2026: it renewed.
    assert policy_end(date(2025, 9, 23), date(2026, 11, 12)).date == date(2027, 9, 23)
    assert policy_end(date(2025, 9, 23), date(2026, 9, 23)).days_left == 0


def test_data_that_stops_before_the_end_cannot_show_a_renewal() -> None:
    # National Union, MC 207446: L&I frozen May 14, 2026, before the Jun 18, 2026 end.
    end = policy_end(date(2025, 6, 18), date(2026, 11, 12), as_of=date(2026, 5, 14))
    assert (end.date, end.days_left) == (date(2026, 6, 18), -147)
    # On file since 2021: the frozen data shows renewals through 2025, not 2026.
    assert policy_end(date(2021, 6, 18), date(2026, 11, 12), date(2026, 5, 14)).date == date(
        2026, 6, 18
    )


def test_leap_years() -> None:
    assert policy_end(date(2023, 3, 1), date(2023, 6, 1)).date == date(2024, 3, 1)
    assert policy_end(date(2024, 2, 29), date(2024, 3, 1)).date == date(2025, 2, 28)
    assert policy_end(date(2024, 2, 29), date(2027, 3, 1)).date == date(2028, 2, 29)


@pytest.mark.parametrize(
    ("days_left", "stage"), [(45, None), (31, None), (30, 30), (8, 30), (7, 7), (0, 7), (-1, None)]
)
def test_stage_for(days_left: int, stage: int | None) -> None:
    assert stage_for(days_left, [30, 7]) == stage


# --- sending (database) --------------------------------------------------------------------

TODAY = date(2026, 9, 1)  # 22 days before Sep 23, 2026: the 30-day reminder is due


class FakeSender:
    def __init__(self, fail: bool = False) -> None:
        self.sent: list[dict[str, object]] = []
        self.fail = fail

    def send(
        self,
        *,
        to: list[str],
        subject: str,
        text: str,
        html: str,
        idempotency_key: str,
        attachments: Sequence[Attachment] = (),
    ) -> str:
        if self.fail:
            raise RuntimeError("mail service down")
        self.sent.append({"to": to, "subject": subject, "text": text, "html": html})
        return "id"


@pytest.fixture
def reminders_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "insurance_reminders_enabled", True)
    monkeypatch.setattr(get_settings(), "insurance_reminders_census_email", False)
    monkeypatch.setattr(get_settings(), "insurance_reminder_days", "30,7")
    monkeypatch.setattr(get_settings(), "insurance_reminders_copy_to", None)


def filing(
    db: Session,
    carrier_id: int,
    effective: date,
    insurance_type: str = "BIPD",
    termination: date | None = None,
) -> Insurance:
    row = Insurance(
        carrier_id=carrier_id,
        docket_prefix=DocketPrefix.MC,
        docket_number="787470",
        insurer="UNITED FINANCIAL CASUALTY COMPANY",
        insurance_type=insurance_type,
        coverage_amount=Decimal("750000"),
        policy_number="CA863447376",
        effective_date=effective,
        termination_date=termination,
        on_file=True,
        status="ON_FILE",
        source="dot_socrata",
        raw_record_id=make_raw_record(db, external_id=f"ins-{effective}-{insurance_type}").id,
    )
    db.add(row)
    db.flush()
    return row


def client_carrier(db: Session, usdot: int = 2306585) -> int:
    """A carrier linked to a client organization with one active user; returns carrier id."""
    carrier = make_carrier(db, usdot, "STINGRAY EXPRESS INC")
    org = make_org(db, "Stingray Express", OrganizationKind.CLIENT)
    db.add(OrganizationCarrier(organization_id=org.id, usdot_number=usdot))
    make_user(db, org, "owner@stingray.test", UserRole.CLIENT_ADMIN)
    db.flush()
    return carrier.id


@pytest.mark.usefixtures("reminders_on")
def test_client_user_gets_the_30_day_reminder_once(db: Session) -> None:
    filing(db, client_carrier(db), date(2025, 9, 23))
    sender = FakeSender()

    sent = send_due_reminders(db, sender, TODAY)

    assert [(s.recipient, s.end_date, s.days_before) for s in sent] == [
        ("owner@stingray.test", date(2026, 9, 23), 30)
    ]
    email = sender.sent[0]
    assert email["to"] == ["owner@stingray.test"]
    assert email["subject"] == "Insurance renewal coming up for STINGRAY EXPRESS INC"
    text = str(email["text"])
    assert "USDOT 2306585, MC787470" in text
    assert "UNITED FINANCIAL CASUALTY COMPANY, policy CA863447376, $750,000" in text
    assert "around September 23, 2026 (in 22 days)" in text
    assert f"unsubscribe?t={email_hash('owner@stingray.test')}" in text
    assert "owner@stingray.test" not in text.split("Unsubscribe")[1]  # never the address
    assert "Unsubscribe</a>" in str(email["html"])

    # The next round sends nothing new; the 7-day reminder comes later.
    assert send_due_reminders(db, sender, TODAY) == []
    later = send_due_reminders(db, sender, date(2026, 9, 18))
    assert [s.days_before for s in later] == [7]
    assert len(sender.sent) == 2


@pytest.mark.usefixtures("reminders_on")
def test_nothing_due_too_early_or_for_bonds_or_cancelled(db: Session) -> None:
    carrier_id = client_carrier(db)
    filing(db, carrier_id, date(2025, 11, 1))  # ends Nov 1: 61 days off
    filing(db, carrier_id, date(2025, 9, 20), insurance_type="BOND")  # no yearly term
    # Cancellation filed for Sep 10, before the Sep 22 end: that ends it, not a renewal.
    filing(db, carrier_id, date(2025, 9, 22), termination=date(2026, 9, 10))

    assert send_due_reminders(db, FakeSender(), TODAY) == []


@pytest.mark.usefixtures("reminders_on")
def test_no_reminder_for_a_passed_unconfirmed_end(db: Session) -> None:
    row = filing(db, client_carrier(db), date(2025, 6, 18))
    row.status_as_of = date(2026, 5, 14)  # frozen L&I data
    db.flush()
    assert send_due_reminders(db, FakeSender(), date(2026, 11, 12)) == []


@pytest.mark.usefixtures("reminders_on")
def test_off_by_default_and_without_an_email_service(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    filing(db, client_carrier(db), date(2025, 9, 23))
    assert send_due_reminders(db, None, TODAY) == []
    monkeypatch.setattr(get_settings(), "insurance_reminders_enabled", False)
    sender = FakeSender()
    assert send_due_reminders(db, sender, TODAY) == []
    assert sender.sent == []


@pytest.mark.usefixtures("reminders_on")
def test_failed_send_is_retried_next_round(db: Session) -> None:
    filing(db, client_carrier(db), date(2025, 9, 23))
    assert send_due_reminders(db, FakeSender(fail=True), TODAY) == []
    assert db.scalars(select(InsuranceReminder)).all() == []
    assert len(send_due_reminders(db, FakeSender(), TODAY)) == 1


@pytest.mark.usefixtures("reminders_on")
def test_disabled_users_and_other_portals_get_nothing(db: Session) -> None:
    carrier = make_carrier(db, 2306585, "STINGRAY EXPRESS INC")
    broker = make_org(db, "A Brokerage", OrganizationKind.BROKER)
    db.add(OrganizationCarrier(organization_id=broker.id, usdot_number=2306585))
    make_user(db, broker, "broker@test", UserRole.BROKER_ADMIN)
    client = make_org(db, "Stingray", OrganizationKind.CLIENT)
    db.add(OrganizationCarrier(organization_id=client.id, usdot_number=2306585))
    make_user(db, client, "gone@stingray.test", UserRole.CLIENT_ADMIN).status = UserStatus.DISABLED
    filing(db, carrier.id, date(2025, 9, 23))

    assert send_due_reminders(db, FakeSender(), TODAY) == []


@pytest.mark.usefixtures("reminders_on")
def test_census_email_only_when_switched_on(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    carrier = make_carrier(db, 2306585, "STINGRAY EXPRESS INC")
    db.add(MonitoredCarrier(usdot_number=2306585))
    make_raw_record(db, "2306585", dot_number="2306585", email_address="dispatch@stingray.test")
    filing(db, carrier.id, date(2025, 9, 23))

    assert send_due_reminders(db, FakeSender(), TODAY) == []  # census email is off

    monkeypatch.setattr(get_settings(), "insurance_reminders_census_email", True)
    sender = FakeSender()
    sent = send_due_reminders(db, sender, TODAY)
    assert [s.recipient for s in sent] == ["dispatch@stingray.test"]
    assert "/contact?usdot=2306585" in str(sender.sent[0]["text"])  # no account: contact STS


@pytest.mark.usefixtures("reminders_on")
def test_test_routing_and_sts_summary(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "dataqs_email_carrier_override", "tester@sts.test")
    monkeypatch.setattr(get_settings(), "insurance_reminders_copy_to", "renewals@sts.test")
    filing(db, client_carrier(db), date(2025, 9, 23))
    sender = FakeSender()

    send_due_reminders(db, sender, TODAY)

    reminder, summary = sender.sent
    assert reminder["to"] == ["tester@sts.test"]
    assert str(reminder["text"]).startswith("[Test routing: meant for owner@stingray.test]")
    assert summary["to"] == ["renewals@sts.test"]
    assert "STINGRAY EXPRESS INC (USDOT 2306585)" in str(summary["text"])
    # Recorded for the real recipient, so switching test routing off doesn't send it again.
    assert db.scalars(select(InsuranceReminder.recipient)).all() == ["owner@stingray.test"]


# --- unsubscribe ---------------------------------------------------------------------------


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.usefixtures("reminders_on")
def test_unsubscribe_stops_reminders(db: Session, api: TestClient) -> None:
    filing(db, client_carrier(db), date(2025, 9, 23))
    token = email_hash("owner@stingray.test")

    # Opening the link only asks: a mail scanner that opens links unsubscribes nobody.
    page = api.get(f"/api/v1/insurance-reminders/unsubscribe?t={token}")
    assert page.status_code == 200 and "<form" in page.text
    assert send_due_reminders(db, FakeSender(), date(2026, 9, 1)) != []

    done = api.post("/api/v1/insurance-reminders/unsubscribe", data={"t": token})
    assert done.status_code == 200 and "unsubscribed" in done.text
    assert send_due_reminders(db, FakeSender(), date(2026, 9, 18)) == []  # no 7-day one


def test_unsubscribe_rejects_a_broken_link(api: TestClient) -> None:
    response = api.post("/api/v1/insurance-reminders/unsubscribe", data={"t": "nope"})
    assert response.status_code == 400
