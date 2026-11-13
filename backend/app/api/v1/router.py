"""Collects every v1 route module. Add one include_router line per new resource.

Access: health, auth, Contact Us and Try Now (one carrier, see routes/try_now.py) are public;
carrier data, signals, jobs and the dashboard are the internal portal (STS staff only); admin and
the client / broker portals check their own roles per route.
"""

from fastapi import APIRouter, Depends

from app.api.auth import require_staff
from app.api.v1.routes import (
    account_log,
    admin,
    auth,
    billing,
    carriers,
    compliance,
    contact,
    dashboard,
    dataqs,
    directory,
    health,
    insurance_reminders,
    invoices,
    iss,
    jobs,
    monitored,
    partner,
    portal,
    report_render,
    signals,
    try_now,
    twilio_webhooks,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(try_now.router)
api_router.include_router(contact.router)
api_router.include_router(insurance_reminders.router)  # unsubscribe link (public)
api_router.include_router(partner.router)  # its own API keys (routes/partner.py)
# The bare report page's data while the Score Card Sharing API prints it: report pass only.
api_router.include_router(report_render.router)

staff_only = [Depends(require_staff)]
api_router.include_router(carriers.router, dependencies=staff_only)
api_router.include_router(signals.router, dependencies=staff_only)
api_router.include_router(jobs.router, dependencies=staff_only)
api_router.include_router(dashboard.router, dependencies=staff_only)
api_router.include_router(iss.router, dependencies=staff_only)

api_router.include_router(admin.router)
api_router.include_router(monitored.router)  # Admin Monitored DOTs (STS admins)
api_router.include_router(account_log.router)  # Account logs (STS admins)
# Carrier pages report the tabs each logged-in person opens (any portal).
api_router.include_router(account_log.activity_router)
api_router.include_router(portal.router)
api_router.include_router(portal.broker_router)
# DataQs: staff (/dataqs) and client (/portal/dataqs) routes check their own login per route.
api_router.include_router(dataqs.router)
api_router.include_router(dataqs.portal_router)
# Twilio calls these with the carrier's reply; each request's signature is checked.
api_router.include_router(twilio_webhooks.router)
# The Compliance tab and STS's service requests: each route checks the user's access.
api_router.include_router(compliance.router)
api_router.include_router(invoices.router)
api_router.include_router(invoices.webhook_router)
# The $49/month subscription for client and broker logins.
api_router.include_router(billing.router)
api_router.include_router(directory.public_router)  # the carrier map, public (no login)
api_router.include_router(directory.router)  # the carrier map, carrier and agent portals
