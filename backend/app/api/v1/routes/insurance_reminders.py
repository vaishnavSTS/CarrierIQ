"""Unsubscribing from insurance renewal reminders (services/insurance_reminders.py). Public: the
link in each email carries a keyed hash of the address, never the address.

Opening the link only shows a button; the unsubscribe happens when it is pressed (a POST), so a
mail scanner that opens links doesn't unsubscribe anyone.
"""

import html
from typing import Annotated

from fastapi import APIRouter, Depends, Form, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.insurance_reminders import opt_out

router = APIRouter(prefix="/insurance-reminders", tags=["insurance-reminders"])

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Insurance reminders · Carrier Safety Scan</title>
<style>
body{{font-family:Arial,sans-serif;background:#f6f5fb;color:#14121f;margin:0;padding:48px 16px}}
main{{max-width:480px;margin:0 auto;background:#fff;border:1px solid #e4e2ee;border-radius:12px;
padding:28px}}
h1{{font-size:20px;margin:0 0 12px}} p{{font-size:14px;line-height:1.5}}
button{{background:#6d4aff;color:#fff;border:0;border-radius:6px;padding:10px 16px;font-size:14px;
cursor:pointer}}
</style></head>
<body><main><h1>{title}</h1>{body}
<p style="color:#6b6880;font-size:12px">Sky Transport Solutions · Carrier Safety Scan</p>
</main></body></html>"""


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    return HTMLResponse(PAGE.format(title=html.escape(title), body=body), status_code=status)


@router.get("/unsubscribe", response_class=HTMLResponse)
def unsubscribe_page(t: Annotated[str, Query(max_length=64)] = "") -> HTMLResponse:
    return _page(
        "Stop insurance renewal reminders?",
        "<p>You'll no longer get emails about upcoming insurance renewals from Carrier Safety "
        "Scan. Other emails, such as DataQs updates, aren't affected.</p>"
        '<form method="post" action="unsubscribe">'
        f'<input type="hidden" name="t" value="{html.escape(t)}">'
        "<button type=submit>Unsubscribe</button></form>",
    )


@router.post("/unsubscribe", response_class=HTMLResponse)
def unsubscribe(
    db: Annotated[Session, Depends(get_db)], t: Annotated[str, Form(max_length=64)] = ""
) -> HTMLResponse:
    if not opt_out(db, t):
        return _page(
            "This link doesn't work",
            "<p>The unsubscribe link is incomplete. Please use the link from the email, or reply "
            "to the email and we'll take you off the list.</p>",
            status=400,
        )
    return _page(
        "You're unsubscribed",
        "<p>You won't get insurance renewal reminders from Carrier Safety Scan any more.</p>",
    )
