"""An invoice as a PDF (US Letter), in the same layout as the invoice page: the CarrierSafetyScan
logo ("Powered by Sky Transport Solutions"), From / To, the lines, the total, a PAID / VOID /
REFUNDED stamp and the payment dispute policy. Attached to the emails sent when it's paid."""

from datetime import datetime
from decimal import Decimal
from io import BytesIO
from zoneinfo import ZoneInfo

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen.canvas import Canvas

from app.schemas.invoice import InvoiceOut

STS_TIME = ZoneInfo("America/Los_Angeles")  # STS is in Tracy, CA
INK = HexColor("#1f2328")
MUTED = HexColor("#4b5563")
RULE = HexColor("#e5e7eb")
STRIPE = HexColor("#f3f4f6")
VIOLET = HexColor("#8b5cf6")
FUCHSIA = HexColor("#c026d3")
BRAND_TEXT = HexColor("#9333ea")
STAMPS = {"PAID": HexColor("#c8102e"), "VOID": HexColor("#6b7280"), "REFUNDED": HexColor("#6b7280")}

LEFT, RIGHT = 50.0, LETTER[0] - 50.0
# Table columns: (heading, x of the left edge, width)
COLUMNS = [
    ("#", 55.0, 20.0),
    ("Item", 80.0, 215.0),
    ("Description", 300.0, 95.0),
    ("Qnt", 400.0, 35.0),
    ("Rate", 440.0, 55.0),
    ("Subtotal", 500.0, 62.0),
]


def _day(value: datetime | None) -> str:
    return value.astimezone(STS_TIME).strftime("%m-%d-%Y") if value else ""


def _money(value: Decimal) -> str:
    return f"{value:,.2f}"


def _logo(c: Canvas, x: float, y: float, size: float) -> None:
    """The CarrierSafetyScan mark: a violet-to-fuchsia rounded square with a white radar."""
    c.saveState()
    path = c.beginPath()
    path.roundRect(x, y, size, size, 6)
    c.clipPath(path, stroke=0, fill=0)
    c.linearGradient(x, y + size, x + size, y, (VIOLET, FUCHSIA), extend=False)
    c.restoreState()
    cx, cy = x + size / 2, y + size / 2
    c.setStrokeColor(white)
    c.setLineWidth(1.3)
    c.circle(cx, cy, size * 0.3, stroke=1, fill=0)
    c.circle(cx, cy, size * 0.13, stroke=1, fill=0)
    c.line(cx, cy, cx + size * 0.24, cy + size * 0.18)
    c.setFillColor(white)
    c.circle(cx, cy, 1.2, stroke=0, fill=1)


def render_invoice_pdf(inv: InvoiceOut) -> bytes:
    out = BytesIO()
    c = Canvas(out, pagesize=LETTER)
    c.setTitle(f"Invoice {inv.number}")
    c.setAuthor("Sky Transport Solutions")
    top = LETTER[1] - 50

    # Header: logo and name, invoice number.
    _logo(c, LEFT, top - 30, 30)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(LEFT + 38, top - 12, "CarrierSafetyScan")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    c.drawString(LEFT + 38, top - 25, "Powered by ")
    c.setFillColor(BRAND_TEXT)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(
        LEFT + 38 + c.stringWidth("Powered by ", "Helvetica", 8.5),
        top - 25,
        "Sky Transport Solutions",
    )
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawRightString(RIGHT, top - 20, f"Invoice #{inv.number}")

    # From, and the dates.
    y = top - 72
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(LEFT, y, "From")
    lines = [
        (inv.issuer.get("name", ""), True),
        (inv.issuer.get("street", ""), False),
        (inv.issuer.get("city_state_zip", ""), False),
        (f"Phone: {inv.issuer.get('phone', '')}", False),
        (f"Email: {inv.issuer.get('email', '')}", False),
    ]
    for text, bold in lines:
        y -= 13
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        c.drawString(LEFT, y, text)
    facts = [("Date:", _day(inv.issued_at))]
    if inv.paid_at:
        facts.append(("Paid on:", _day(inv.paid_at)))
    if inv.voided_at:
        facts.append(("Voided on:", _day(inv.voided_at)))
    facts.append(("USDOT:", str(inv.usdot_number)))
    fy = top - 72
    for label, value in facts:
        c.setFont("Helvetica", 9)
        c.drawRightString(RIGHT, fy, value)
        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(RIGHT - c.stringWidth(value, "Helvetica", 9) - 4, fy, label)
        fy -= 18

    # To.
    y -= 30
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(LEFT, y, "To")
    to = inv.bill_to
    to_lines: list[tuple[str, bool]] = [(str(to.get("name") or "").upper(), True)]
    to_lines += [(str(to[k]), False) for k in ("street", "city_state_zip") if to.get(k)]
    if to.get("phone"):
        to_lines.append((f"Phone: {to['phone']}", False))
    if to.get("emails"):
        emails = "Email: " + ", ".join(to["emails"])
        for part in simpleSplit(emails, "Helvetica", 9, RIGHT - LEFT):
            to_lines.append((part, False))
    for text, bold in to_lines:
        y -= 13
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        c.drawString(LEFT, y, text)

    # The lines.
    y -= 32
    c.setStrokeColor(RULE)
    c.setLineWidth(0.8)
    c.line(LEFT, y + 14, RIGHT, y + 14)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(INK)
    for heading, x, _ in COLUMNS:
        c.drawString(x, y, heading)
    c.line(LEFT, y - 8, RIGHT, y - 8)
    y -= 8
    for n, line in enumerate(inv.lines):
        item = simpleSplit(line.item.upper(), "Helvetica", 9, COLUMNS[1][2])
        height = 10 + 12 * len(item)
        if n % 2 == 0:
            c.setFillColor(STRIPE)
            c.rect(LEFT, y - height, RIGHT - LEFT, height, stroke=0, fill=1)
        c.setFillColor(INK)
        c.setFont("Helvetica", 9)
        row = y - 15
        cells = [
            str(line.position),
            "",
            line.description,
            str(line.quantity),
            _money(line.rate),
            _money(line.amount),
        ]
        for (_, x, _w), text in zip(COLUMNS, cells, strict=True):
            c.drawString(x, row, text)
        for i, part in enumerate(item):
            c.drawString(COLUMNS[1][1], row - 12 * i, part)
        y -= height
    c.line(LEFT, y - 6, RIGHT, y - 6)
    y -= 22
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(COLUMNS[5][1] - 14, y, "Total:")
    c.setFont("Helvetica", 9)
    c.drawString(COLUMNS[5][1], y, f"${_money(inv.total)}")

    # The stamp.
    color = STAMPS.get(inv.status.value)
    if color is not None:
        c.saveState()
        c.translate(LEFT + 110, y - 60)
        c.rotate(12)
        c.setStrokeColor(color)
        c.setFillColor(color)
        c.setLineWidth(3.5)
        label = inv.status.value
        width = c.stringWidth(label, "Helvetica-Bold", 30) + 30
        c.roundRect(-width / 2, -18, width, 40, 4, stroke=1, fill=0)
        c.setFont("Helvetica-Bold", 30)
        c.drawCentredString(0, -7, label)
        c.restoreState()

    # Footer: the payment dispute policy.
    text = simpleSplit(
        "Payment dispute policy: " + inv.dispute_policy, "Helvetica", 7.5, RIGHT - LEFT
    )
    fy = 50 + 10 * len(text)
    c.setStrokeColor(RULE)
    c.line(LEFT, fy + 8, RIGHT, fy + 8)
    for i, part in enumerate(text):
        c.setFillColor(MUTED)
        if i == 0:
            c.setFont("Helvetica-Bold", 7.5)
            c.setFillColor(INK)
            c.drawString(LEFT, fy, "Payment dispute policy:")
            rest = part[len("Payment dispute policy:") :]
            c.setFont("Helvetica", 7.5)
            c.setFillColor(MUTED)
            c.drawString(
                LEFT + c.stringWidth("Payment dispute policy:", "Helvetica-Bold", 7.5), fy, rest
            )
        else:
            c.setFont("Helvetica", 7.5)
            c.drawString(LEFT, fy, part)
        fy -= 10

    c.showPage()
    c.save()
    return out.getvalue()
