"""On-the-fly invoice PDF generation for paid orders.

Never includes private asset storage paths, download URLs, or Stripe secrets.
"""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO

from django.core.exceptions import ObjectDoesNotExist
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from orders.entitlements import order_allows_download
from orders.models import Order
from orders.services import OrderService


def invoice_pdf_filename(order: Order) -> str:
    safe = "".join(
        ch if ch.isalnum() or ch in "-_" else "-"
        for ch in (order.invoice_number or "invoice")
    )
    return f"invoice-{safe}.pdf"


def build_invoice_pdf(order: Order) -> bytes:
    """Build a PDF invoice from order / line-item snapshots."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    story: list = []

    customer = order.user
    customer_name = (getattr(customer, "full_name", None) or "").strip() or "Customer"
    customer_email = (getattr(customer, "email", None) or "").strip() or "—"

    story.append(Paragraph("Invoice", styles["Title"]))
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph(f"<b>Invoice number:</b> {order.invoice_number}", styles["Normal"]))
    story.append(
        Paragraph(
            f"<b>Date:</b> {order.created_at.strftime('%Y-%m-%d %H:%M UTC')}",
            styles["Normal"],
        )
    )
    if order_allows_download(order):
        story.append(Paragraph("<b>Status:</b> Paid", styles["Normal"]))
    else:
        story.append(
            Paragraph(
                f"<b>Status:</b> {order.order_status} / {order.payment_status}",
                styles["Normal"],
            )
        )
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("<b>Bill to</b>", styles["Heading3"]))
    story.append(Paragraph(customer_name, styles["Normal"]))
    story.append(Paragraph(customer_email, styles["Normal"]))
    story.append(Spacer(1, 0.25 * inch))

    currency = (order.currency or "USD").upper()
    items = list(order.items.all())
    snapshots = OrderService.build_catalog_snapshots(items)

    header = ["Item", "Qty", "Unit price", "Line total"]
    rows: list[list[str]] = [header]
    for item in items:
        key = (item.product_type, item.product_id)
        title = (item.title or "").strip()
        if not title:
            snap_title, _snap_slug = snapshots.get(key, (None, None))
            title = (snap_title or "").strip() or f"{item.product_type}:{item.product_id}"
        unit = Decimal(item.purchase_price)
        line_total = item.line_total
        rows.append(
            [
                title,
                str(item.quantity),
                f"{currency} {unit:.2f}",
                f"{currency} {line_total:.2f}",
            ]
        )

    items_total = OrderService.compute_items_total(order)
    discount = items_total - Decimal(order.total_amount)
    if discount < Decimal("0.00"):
        discount = Decimal("0.00")

    coupon_code = ""
    try:
        payment = order.payment
    except ObjectDoesNotExist:
        payment = None
    if payment is not None and payment.coupon_id is not None:
        coupon = payment.coupon
        if coupon is not None:
            coupon_code = (coupon.code or "").strip()

    table = Table(rows, colWidths=[3.4 * inch, 0.7 * inch, 1.3 * inch, 1.3 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 0.25 * inch))

    totals: list[list[str]] = [
        ["Items total", f"{currency} {items_total:.2f}"],
    ]
    if discount > Decimal("0.00"):
        label = "Discount"
        if coupon_code:
            label = f"Discount ({coupon_code})"
        totals.append([label, f"-{currency} {discount:.2f}"])
    totals.append(["Total", f"{currency} {Decimal(order.total_amount):.2f}"])

    totals_table = Table(totals, colWidths=[4.7 * inch, 2.0 * inch])
    totals_table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(totals_table)
    story.append(Spacer(1, 0.35 * inch))
    story.append(
        Paragraph(
            "Thank you for your purchase. This invoice is a record of payment "
            "for digital assets on 3D Asset Marketplace.",
            styles["Normal"],
        )
    )

    doc.build(story)
    return buffer.getvalue()
