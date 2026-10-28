"""The $25/month subscription: the 14-day trial from sign-up, the lock once it ends, Stripe's
subscribe and billing pages, and Stripe's webhook starting and ending the subscription. Accounts
made before subscriptions (no trial end) and STS staff stay free."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.routes.compliance import get_request_email_sender, get_stripe_client
from app.core.config import get_settings
from app.main import app
from app.models import Carrier, Invoice, InvoiceLine, User
from app.models.enums import InvoiceStatus, UserRole, UserStatus
from app.services.stripe_client import StripeClient
from tests.api.test_auth import api, log_in, make_user, register  # noqa: F401 - fixture
from tests.dataqs.test_compliance_tab import FakeSender
from tests.dataqs.test_invoices import SECRET, signed

STRIPE_PAGE = "https://checkout.stripe.com/c/pay/cs_test_sub"


class FakeStripe:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str]]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        self.calls.append((request.url.path, form))
        return httpx.Response(200, json={"id": "cs_test_sub", "url": STRIPE_PAGE})


@pytest.fixture
def stripe(api: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeStripe]:  # noqa: F811
    monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", SECRET)
    fake = FakeStripe()
    app.dependency_overrides[get_stripe_client] = lambda: StripeClient(httpx.MockTransport(fake))
    yield fake


def owner(db: Session) -> User:
    user = db.scalar(select(User).where(User.email == "owner@client.com"))
    assert user is not None
    return user


def signed_up(api: TestClient, db: Session) -> User:  # noqa: F811
    db.add(Carrier(usdot_number=295017, legal_name="CLIENT TRUCKING LLC"))
    register(api)
    return owner(db)


def end_trial(db: Session, user: User) -> None:
    user.trial_ends_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()


def test_a_new_sign_up_gets_14_free_days(api: TestClient, db: Session) -> None:  # noqa: F811
    user = signed_up(api, db)
    assert user.trial_ends_at is not None
    left = user.trial_ends_at - datetime.now(UTC)
    assert timedelta(days=13, hours=23) < left <= timedelta(days=14)

    billing = api.get("/api/v1/auth/me").json()["billing"]
    assert billing["state"] == "trial" and billing["trial_days_left"] == 14
    assert billing["monthly_price"] == "25" and billing["can_manage"] is False
    assert api.get("/api/v1/portal/overview").status_code == 200


def test_after_the_trial_only_subscribing_and_invoices_stay_open(
    api: TestClient,  # noqa: F811
    db: Session,
) -> None:
    end_trial(db, signed_up(api, db))
    locked = api.get("/api/v1/portal/overview")
    assert locked.status_code == 402 and locked.json()["error"]["code"] == "subscription_required"
    assert api.get("/api/v1/auth/me").json()["billing"]["state"] == "locked"
    assert api.get("/api/v1/billing").json()["state"] == "locked"
    assert api.get("/api/v1/invoices?usdot_number=295017").status_code == 200
    assert api.post("/api/v1/auth/logout").status_code == 204


def test_accounts_from_before_and_staff_stay_free(api: TestClient, db: Session) -> None:  # noqa: F811
    make_user(db, "old@client.test", UserRole.CLIENT_ADMIN, UserStatus.ACTIVE)
    log_in(api, "old@client.test")
    assert api.get("/api/v1/auth/me").json()["billing"] is None
    assert api.get("/api/v1/billing").json() is None
    assert api.post("/api/v1/billing/subscribe").status_code == 403

    make_user(db, "admin@sts.test", UserRole.STS_ADMIN, UserStatus.ACTIVE)
    log_in(api, "admin@sts.test")
    assert api.get("/api/v1/auth/me").json()["billing"] is None


def test_subscribing_opens_stripe_for_25_a_month(
    api: TestClient,  # noqa: F811
    db: Session,
    stripe: FakeStripe,
) -> None:
    user = signed_up(api, db)
    end_trial(db, user)
    response = api.post("/api/v1/billing/subscribe")
    assert response.status_code == 200, response.text
    assert response.json() == {"url": STRIPE_PAGE}
    [(path, form)] = stripe.calls
    assert path == "/v1/checkout/sessions" and form["mode"] == "subscription"
    assert form["line_items[0][price_data][unit_amount]"] == "2500"
    assert form["line_items[0][price_data][recurring][interval]"] == "month"
    assert form["customer_email"] == "owner@client.com"
    assert form["subscription_data[metadata][user_id]"] == str(user.id)
    assert form["success_url"].endswith("/portal?subscribed=1")


def test_stripes_webhook_starts_and_ends_the_subscription(
    api: TestClient,  # noqa: F811
    db: Session,
    stripe: FakeStripe,
) -> None:
    user = signed_up(api, db)
    end_trial(db, user)
    started = {
        "id": "evt_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_sub",
                "mode": "subscription",
                "customer": "cus_1",
                "subscription": "sub_1",
                "client_reference_id": f"user-{user.id}",
                "metadata": {"user_id": str(user.id)},
            }
        },
    }
    assert signed(api, started).json() == {"result": "subscribed"}
    db.refresh(user)
    assert (user.subscription_status, user.stripe_customer_id) == ("active", "cus_1")
    assert api.get("/api/v1/portal/overview").status_code == 200
    billing = api.get("/api/v1/auth/me").json()["billing"]
    assert billing["state"] == "active" and billing["can_manage"] is True

    # Stripe's billing page, to change the card or cancel.
    assert api.post("/api/v1/billing/manage").json() == {"url": STRIPE_PAGE}
    assert stripe.calls[-1] == (
        "/v1/billing_portal/sessions",
        {"customer": "cus_1", "return_url": "http://localhost:5173/portal"},
    )

    period_end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    renewed = {
        "id": "evt_2",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "id": "sub_1",
                "customer": "cus_1",
                "status": "past_due",  # Stripe is retrying a failed charge: still open
                "items": {"data": [{"current_period_end": period_end}]},
                "metadata": {"user_id": str(user.id)},
            }
        },
    }
    assert signed(api, renewed).json() == {"result": "subscription past_due"}
    assert api.get("/api/v1/portal/overview").status_code == 200

    ended = {**renewed, "id": "evt_3", "type": "customer.subscription.deleted"}
    assert signed(api, ended).json() == {"result": "subscription canceled"}
    db.refresh(user)
    assert user.subscription_status == "canceled"
    assert api.get("/api/v1/portal/overview").status_code == 402


def test_an_invoice_payment_is_not_taken_for_a_subscription(
    api: TestClient,  # noqa: F811
    db: Session,
    stripe: FakeStripe,
) -> None:
    paid = {
        "id": "evt_9",
        "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_1", "mode": "payment", "payment_status": "paid"}},
    }
    assert signed(api, paid).json() == {"result": "no such invoice"}


# --- An invoice for each month Stripe charges ----------------------------------------------------


def paid_month(user: User, invoice_id: str = "in_1", amount: int = 2500) -> dict:
    """Stripe's invoice.paid for a subscription month (newer API shape: under `parent`)."""
    start = int(datetime(2026, 10, 28, tzinfo=UTC).timestamp())
    end = int(datetime(2026, 11, 28, tzinfo=UTC).timestamp())
    return {
        "id": f"evt_{invoice_id}",
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": invoice_id,
                "customer": "cus_1",
                "amount_paid": amount,
                "billing_reason": "subscription_cycle",
                "parent": {
                    "subscription_details": {
                        "subscription": "sub_1",
                        "metadata": {"user_id": str(user.id)},
                    }
                },
                "lines": {"data": [{"period": {"start": start, "end": end}}]},
            }
        },
    }


@pytest.fixture
def mails(api: TestClient) -> Iterator[FakeSender]:  # noqa: F811
    fake = FakeSender()
    app.dependency_overrides[get_request_email_sender] = lambda: fake
    yield fake


def test_each_paid_month_becomes_a_paid_invoice_emailed_with_its_pdf(
    api: TestClient,  # noqa: F811
    db: Session,
    stripe: FakeStripe,
    mails: FakeSender,
) -> None:
    user = signed_up(api, db)
    result = signed(api, paid_month(user)).json()["result"]
    assert result.startswith("subscription invoice ")
    [invoice] = db.scalars(select(Invoice).where(Invoice.organization_id == user.organization_id))
    assert (invoice.status, invoice.total, invoice.usdot_number) == (
        InvoiceStatus.PAID,
        Decimal("25.00"),
        295017,
    )
    [line] = db.scalars(select(InvoiceLine).where(InvoiceLine.invoice_id == invoice.id))
    assert line.item == "CARRIERSAFETYSCAN SUBSCRIPTION"
    assert line.description == "Oct 28, 2026 to Nov 28, 2026"

    client_mail = next(m for m in mails.sent if m["to"] == ["owner@client.com"])
    assert "subscription payment" in client_mail["text"]
    assert client_mail["files"] and client_mail["files"][0].data.startswith(b"%PDF")

    # Stripe sending it again changes nothing.
    before = len(mails.sent)
    signed(api, paid_month(user))
    assert db.scalar(select(func.count(Invoice.id))) == 1 and len(mails.sent) == before

    # The client sees it on their carrier's Invoices tab.
    listed = api.get("/api/v1/invoices?usdot_number=295017").json()["invoices"]
    assert [i["number"] for i in listed] == [invoice.number]


def test_a_brokers_invoice_shows_on_their_invoices_page(
    api: TestClient,  # noqa: F811
    db: Session,
    stripe: FakeStripe,
    mails: FakeSender,
) -> None:
    broker = make_user(db, "broker@b.test", UserRole.BROKER_ADMIN, UserStatus.ACTIVE)
    broker.trial_ends_at = datetime.now(UTC) + timedelta(days=3)
    other = make_user(db, "other@b.test", UserRole.BROKER_ADMIN, UserStatus.ACTIVE)
    db.commit()
    signed(api, paid_month(broker, "in_b"))
    signed(api, paid_month(other, "in_o"))

    log_in(api, "broker@b.test")
    [mine] = api.get("/api/v1/invoices").json()["invoices"]
    assert mine["usdot_number"] is None and mine["billed_to"] == "Org of broker@b.test"
    assert api.get(f"/api/v1/invoices/{mine['id']}").status_code == 200
    pdf = api.get(f"/api/v1/invoices/{mine['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


def test_a_non_subscription_stripe_invoice_is_left_alone(
    api: TestClient,  # noqa: F811
    db: Session,
    stripe: FakeStripe,
) -> None:
    event = {"id": "evt_x", "type": "invoice.paid", "data": {"object": {"id": "in_x"}}}
    assert signed(api, event).json() == {"result": "ignored"}
