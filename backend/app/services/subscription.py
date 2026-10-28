"""The CarrierSafetyScan subscription: each client and broker login gets a 14-day free trial from
sign-up, then pays $25 a month through Stripe (a Stripe subscription, charged monthly by Stripe).

Who pays: each login (user) separately. STS staff never do, and accounts made before subscriptions
began have no trial end (`trial_ends_at` None), so they stay free.

Access (`billing_state`): free | trial | active | locked. While locked (trial over and no live
subscription) the API answers 402 to everything except logging in and out, the subscription itself
and invoices they already owe (app/api/auth.py), and the portal shows only the subscribe pop-up.

Stripe's webhook keeps `subscription_status` current: checkout.session.completed (mode
subscription) starts it; customer.subscription.created / updated / deleted follow it. Stripe
retries a failed monthly charge; while it does the status is past_due and the app stays open. When
Stripe gives up (unpaid) or the subscription is cancelled, the login locks again.
"""

import logging
import math
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ConflictError, ForbiddenError, ValidationError
from app.models import User
from app.schemas.auth import BillingOut
from app.services.stripe_client import StripeClient

logger = logging.getLogger(__name__)

TRIAL = timedelta(days=14)
MONTHLY_PRICE = Decimal("25")
PRODUCT_NAME = "CarrierSafetyScan subscription"
# Stripe statuses that keep the app open; past_due = Stripe is still retrying the charge.
LIVE_STATUSES = frozenset({"active", "trialing", "past_due"})


def _now() -> datetime:
    return datetime.now(UTC)


def billing_state(user: User, now: datetime) -> str:
    """free | trial | active | locked."""
    if user.role.is_staff or user.trial_ends_at is None:
        return "free"
    if user.subscription_status in LIVE_STATUSES:
        return "active"
    if now < user.trial_ends_at:
        return "trial"
    return "locked"


def billing_out(user: User, now: datetime) -> BillingOut | None:
    """What the portal shows about the subscription; None for logins that never pay."""
    state = billing_state(user, now)
    if state == "free" or user.trial_ends_at is None:
        return None
    days_left = (
        max(0, math.ceil((user.trial_ends_at - now).total_seconds() / 86400))
        if state == "trial"
        else None
    )
    return BillingOut(
        state=state,
        trial_ends_at=user.trial_ends_at,
        trial_days_left=days_left,
        monthly_price=MONTHLY_PRICE,
        subscription_status=user.subscription_status,
        current_period_end=user.subscription_period_end,
        can_manage=user.stripe_customer_id is not None,
    )


def _portal_path(user: User) -> str:
    return "/broker" if user.role.is_broker else "/portal"


def _timestamp(value: Any) -> datetime | None:
    return datetime.fromtimestamp(value, UTC) if isinstance(value, int) and value > 0 else None


class SubscriptionService:
    def __init__(
        self,
        db: Session,
        stripe: StripeClient | None = None,
        now: Callable[[], datetime] = _now,
    ) -> None:
        self.db = db
        self.stripe = stripe or StripeClient()
        self.now = now

    def status(self, user: User) -> BillingOut | None:
        return billing_out(user, self.now())

    def subscribe(self, user: User) -> str:
        """Stripe's page to start the $25/month subscription for this login."""
        if self._billed(user) == "active":
            raise ConflictError("You're already subscribed")
        home = f"{get_settings().public_app_url.rstrip('/')}{_portal_path(user)}"
        session = self.stripe.create_subscription_checkout(
            reference=f"user-{user.id}",
            name=PRODUCT_NAME,
            monthly_amount=MONTHLY_PRICE,
            customer_id=user.stripe_customer_id,
            customer_email=user.email,
            success_url=f"{home}?subscribed=1",
            cancel_url=home,
            metadata={"user_id": str(user.id), "kind": "subscription"},
        )
        return session.url

    def manage(self, user: User) -> str:
        """Stripe's own billing page: change the card, see receipts, cancel."""
        self._billed(user)
        if not user.stripe_customer_id:
            raise ValidationError("There's no subscription to manage yet")
        home = f"{get_settings().public_app_url.rstrip('/')}{_portal_path(user)}"
        session = self.stripe.create_billing_portal(
            customer_id=user.stripe_customer_id, return_url=home
        )
        return session.url

    def _billed(self, user: User) -> str:
        state = billing_state(user, self.now())
        if state == "free":
            raise ForbiddenError("This account doesn't need a subscription")
        return state

    # --- Stripe's webhook ------------------------------------------------------------------------

    def handle_event(self, event: dict[str, Any]) -> str | None:
        """Apply a subscription event; None when the event isn't about a subscription."""
        kind = event.get("type")
        obj = (event.get("data") or {}).get("object") or {}
        if kind == "checkout.session.completed":
            if obj.get("mode") != "subscription":
                return None
            user = self._user(obj)
            if user is None:
                return "no such user"
            user.stripe_customer_id = obj.get("customer") or user.stripe_customer_id
            user.stripe_subscription_id = obj.get("subscription") or user.stripe_subscription_id
            if user.subscription_status not in LIVE_STATUSES:
                user.subscription_status = "active"
            self.db.commit()
            logger.info("User %s subscribed", user.id)
            return "subscribed"
        if kind in (
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
        ):
            user = self._user(obj)
            if user is None:
                return "no such user"
            status = "canceled" if kind.endswith("deleted") else str(obj.get("status") or "")
            sub_id = obj.get("id")
            if (
                user.stripe_subscription_id
                and sub_id != user.stripe_subscription_id
                and status not in LIVE_STATUSES
            ):
                return "old subscription"  # an older one ending doesn't touch the current one
            user.stripe_subscription_id = sub_id or user.stripe_subscription_id
            user.stripe_customer_id = obj.get("customer") or user.stripe_customer_id
            user.subscription_status = status
            # Newer Stripe API versions keep the billing period on the subscription's items.
            items = (obj.get("items") or {}).get("data") or [{}]
            user.subscription_period_end = _timestamp(
                obj.get("current_period_end") or items[0].get("current_period_end")
            )
            self.db.commit()
            return f"subscription {status}"
        return None

    def _user(self, obj: dict[str, Any]) -> User | None:
        user_id = (obj.get("metadata") or {}).get("user_id")
        if user_id is None:
            reference = str(obj.get("client_reference_id") or "")
            user_id = reference.removeprefix("user-") if reference.startswith("user-") else None
        if user_id and str(user_id).isdigit():
            return self.db.get(User, int(user_id))
        sub_id = str(obj.get("id") or "")
        if sub_id.startswith("sub_"):
            return self.db.scalar(select(User).where(User.stripe_subscription_id == sub_id))
        return None
