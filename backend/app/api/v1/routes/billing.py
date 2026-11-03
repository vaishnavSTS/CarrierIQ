"""The $49/month subscription for client and broker logins (app/services/subscription.py): its
state, Stripe's page to subscribe, and Stripe's billing page to manage or cancel it. Open while the
login is locked (app/api/auth.py), so a login whose trial has ended can still subscribe."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser
from app.api.v1.routes.compliance import get_stripe_client
from app.db.session import get_db
from app.schemas.auth import BillingLinkOut, BillingOut
from app.services.stripe_client import StripeClient
from app.services.subscription import SubscriptionService

router = APIRouter(prefix="/billing", tags=["billing"])

Db = Annotated[Session, Depends(get_db)]
Stripe = Annotated[StripeClient, Depends(get_stripe_client)]


@router.get("", response_model=BillingOut | None)
def billing(user: CurrentUser, db: Db) -> BillingOut | None:
    """None for logins that never pay (STS staff, accounts from before subscriptions)."""
    return SubscriptionService(db).status(user)


@router.post("/subscribe", response_model=BillingLinkOut)
def subscribe(user: CurrentUser, db: Db, stripe: Stripe) -> BillingLinkOut:
    """Stripe's page to start the monthly subscription; it returns to the portal (?subscribed=1)."""
    return BillingLinkOut(url=SubscriptionService(db, stripe).subscribe(user))


@router.post("/cancel", response_model=BillingOut | None)
def cancel(user: CurrentUser, db: Db, stripe: Stripe) -> BillingOut | None:
    """Cancel: Stripe charges no more and the subscription ends with the paid month; the app
    stays open until then."""
    return SubscriptionService(db, stripe).cancel(user)


@router.post("/resume", response_model=BillingOut | None)
def resume(user: CurrentUser, db: Db, stripe: Stripe) -> BillingOut | None:
    """Undo a cancellation before the paid month ends."""
    return SubscriptionService(db, stripe).resume(user)


@router.post("/manage", response_model=BillingLinkOut)
def manage(user: CurrentUser, db: Db, stripe: Stripe) -> BillingLinkOut:
    """Stripe's billing page: change the card, see receipts, cancel."""
    return BillingLinkOut(url=SubscriptionService(db, stripe).manage(user))
