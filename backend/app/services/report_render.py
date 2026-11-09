"""The Safety Score Report as a PDF, made from the app's own report page (Score Card Sharing API).

The report is laid out by the frontend (PacketSection), so the PDF is that page printed, exactly
as "Download / Save as PDF" prints it: a headless Chromium opens the bare report page
(/render/safety-score-report/<USDOT>), waits until it is laid out on its A4 pages, and prints it.

The page reads the carrier through /api/v1/report-render/carriers/<USDOT>/..., which accepts only
a report pass: a token signed here that names that one USDOT number and lasts a few minutes. The
browser adds it to those API requests only, so it never goes anywhere else.
"""

import logging
import threading
from typing import Protocol

from app.core.config import get_settings
from app.core.exceptions import CarrierSafetyScanError
from app.core.security import create_purpose_token, read_purpose_token

logger = logging.getLogger(__name__)

REPORT_PASS_PURPOSE = "report_render"
REPORT_PASS_MINUTES = 5
REPORT_PASS_HEADER = "X-Report-Token"
RENDER_TIMEOUT_MS = 120_000  # the first report for a carrier also loads it from FMCSA
# Each render runs a browser (a few hundred MB): at most this many at once.
_renders = threading.BoundedSemaphore(2)


class ReportUnavailableError(CarrierSafetyScanError):
    """The report page couldn't be printed (it didn't load in time, or the browser failed)."""

    status_code = 503
    code = "report_unavailable"


def report_pass(usdot_number: int) -> str:
    return create_purpose_token(
        {"usdot": str(usdot_number)}, REPORT_PASS_PURPOSE, REPORT_PASS_MINUTES
    )


def pass_allows(token: str | None, usdot_number: int) -> bool:
    claims = read_purpose_token(token, REPORT_PASS_PURPOSE) if token else None
    return claims is not None and claims.get("usdot") == str(usdot_number)


class ReportRenderer(Protocol):
    def render(self, usdot_number: int) -> bytes: ...


class BrowserReportRenderer:
    """Prints the report page with Playwright's Chromium (or REPORT_BROWSER_CHANNEL: msedge)."""

    def render(self, usdot_number: int) -> bytes:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import Route, sync_playwright

        settings = get_settings()
        app_url = (settings.report_app_url or settings.public_app_url).rstrip("/")
        token = report_pass(usdot_number)

        def with_pass(route: Route) -> None:
            route.continue_(headers={**route.request.headers, REPORT_PASS_HEADER.lower(): token})

        with _renders:
            try:
                with sync_playwright() as p:
                    browser = p.chromium.launch(channel=settings.report_browser_channel or None)
                    try:
                        page = browser.new_page(viewport={"width": 1280, "height": 900})
                        page.route("**/api/v1/report-render/**", with_pass)
                        page.goto(f"{app_url}/render/safety-score-report/{usdot_number}")
                        page.wait_for_selector(
                            "body[data-report-ready], body[data-report-error]",
                            state="attached",
                            timeout=RENDER_TIMEOUT_MS,
                        )
                        failed = page.get_attribute("body", "data-report-error")
                        if failed is not None:
                            raise ReportUnavailableError(
                                failed or "The Safety Score Report could not be built"
                            )
                        # Lay the report out on its A4 pages again, as printing from the app does.
                        page.evaluate("window.dispatchEvent(new Event('beforeprint'))")
                        page.wait_for_timeout(500)
                        page.emulate_media(media="print")
                        return page.pdf(
                            format="A4", print_background=True, prefer_css_page_size=True
                        )
                    finally:
                        browser.close()
            except PlaywrightError as error:
                logger.exception("Printing the report for USDOT %s failed", usdot_number)
                raise ReportUnavailableError(
                    "The Safety Score Report could not be printed. Please try again shortly."
                ) from error


def get_report_renderer() -> ReportRenderer:
    """How reports are printed (tests replace it)."""
    return BrowserReportRenderer()
