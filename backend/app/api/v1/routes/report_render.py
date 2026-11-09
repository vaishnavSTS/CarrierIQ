"""The carrier data the bare report page reads while the Score Card Sharing API prints it.

The same read-only routes as the broker portal's carrier tabs (portal.add_carrier_routes), under
/report-render/carriers/<USDOT>/..., allowed only with a report pass for that USDOT number
(services/report_render.py): no login, nothing else, and only for a few minutes.
"""

from typing import Annotated

from fastapi import APIRouter, Header, Path

from app.api.v1.routes.portal import add_carrier_routes
from app.core.exceptions import UnauthorizedError
from app.services.report_render import pass_allows

router = APIRouter(prefix="/report-render", tags=["partner"])


def carrier_with_pass(
    usdot_number: Annotated[int, Path(gt=0, lt=100_000_000)],
    x_report_token: Annotated[str | None, Header()] = None,
) -> int:
    if not pass_allows(x_report_token, usdot_number):
        raise UnauthorizedError("A valid report pass for this carrier is required")
    return usdot_number


add_carrier_routes(router, carrier_with_pass)
