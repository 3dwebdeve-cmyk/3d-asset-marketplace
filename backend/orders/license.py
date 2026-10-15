"""Per-order-line license certificates and their public verification.

A certificate names the licensee, the order and the product. It does not mark the
package itself; together with the per-buyer download history it lets a leaked
package be checked against who licensed it.
"""

from __future__ import annotations

import re
import secrets
from io import BytesIO
from xml.sax.saxutils import escape as xml_escape

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from orders.entitlements import order_allows_download
from orders.models import Order, OrderItem
from plugins.models import Plugin
from products.models import Product

# Crockford base32 without the look-alike characters I, L, O and U.
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
LICENSE_CODE_RE = re.compile(r"^LIC(?:-[0-9A-HJKMNP-TV-Z]{4}){4}$")
_LICENSABLE_TYPES = frozenset({OrderItem.ProductType.PRODUCT, OrderItem.ProductType.PLUGIN})


class LicenseError(Exception):
    pass


def _new_license_code() -> str:
    groups = ("".join(secrets.choice(_ALPHABET) for _ in range(4)) for _ in range(4))
    return "LIC-" + "-".join(groups)


def _catalog_license_type(item: OrderItem) -> str:
    model = Product if item.product_type == OrderItem.ProductType.PRODUCT else Plugin
    value = model.objects.filter(pk=item.product_id).values_list("license_type", flat=True).first()
    return value or "standard"


def issue_license(item: OrderItem) -> OrderItem:
    """Return the item with a license code, creating one on first request."""
    if item.product_type not in _LICENSABLE_TYPES:
        raise LicenseError("This item has no license certificate.")
    if not order_allows_download(item.order):
        raise LicenseError("A license is available only for paid orders.")
    if item.license_code:
        return item

    for _ in range(5):
        try:
            with transaction.atomic():
                locked = OrderItem.objects.select_for_update().get(pk=item.pk)
                if locked.license_code:
                    return locked
                locked.license_code = _new_license_code()
                # Snapshot of the catalog license when the certificate is first issued.
                locked.license_type = _catalog_license_type(locked)
                locked.license_issued_at = timezone.now()
                locked.save(
                    update_fields=[
                        "license_code",
                        "license_type",
                        "license_issued_at",
                        "updated_at",
                    ]
                )
                return locked
        except IntegrityError:
            continue  # Code collision; try a fresh one.
    raise LicenseError("Could not issue a license code.")


def license_status(item: OrderItem) -> str:
    """``active`` while the order still grants downloads, else ``revoked``."""
    return "active" if order_allows_download(item.order) else "revoked"


def verify_license(code: str) -> dict | None:
    """Public lookup. Returns no buyer data: only what the license covers."""
    normalized = (code or "").strip().upper()
    if not LICENSE_CODE_RE.match(normalized):
        return None
    item = (
        OrderItem.objects.select_related("order", "order__payment")
        .filter(license_code=normalized)
        .first()
    )
    if item is None:
        return None
    return {
        "license_code": item.license_code,
        "status": license_status(item),
        "product_type": item.product_type,
        "product_title": item.title or "",
        "license_type": item.license_type,
        "issued_at": item.license_issued_at,
    }


def license_pdf_filename(item: OrderItem) -> str:
    return f"license-{item.license_code}.pdf"


def license_verify_url(code: str) -> str:
    base = str(getattr(settings, "FRONTEND_BASE_URL", "") or "").rstrip("/")
    return f"{base}/api/v1/licenses/{code}/"


def build_license_pdf(order: Order, item: OrderItem) -> bytes:
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
    customer = order.user
    # Paragraph parses markup, so every user-controlled value is escaped.
    licensee = xml_escape((getattr(customer, "full_name", "") or "").strip() or "Customer")
    email = xml_escape((getattr(customer, "email", "") or "").strip() or "—")
    title = xml_escape((item.title or "").strip() or f"{item.product_type}:{item.product_id}")
    license_label = xml_escape((item.license_type or "standard").capitalize())
    issued = item.license_issued_at or timezone.now()

    story: list = [
        Paragraph("License certificate", styles["Title"]),
        Spacer(1, 0.15 * inch),
        Paragraph(f"<b>License ID:</b> {item.license_code}", styles["Normal"]),
        Paragraph(f"<b>Status:</b> {license_status(item).capitalize()}", styles["Normal"]),
        Paragraph(f"<b>Issued:</b> {issued.strftime('%Y-%m-%d %H:%M UTC')}", styles["Normal"]),
        Spacer(1, 0.2 * inch),
        Paragraph("<b>Licensee</b>", styles["Heading3"]),
        Paragraph(licensee, styles["Normal"]),
        Paragraph(email, styles["Normal"]),
        Spacer(1, 0.2 * inch),
        Paragraph("<b>Licensed item</b>", styles["Heading3"]),
        Paragraph(title, styles["Normal"]),
        Paragraph(f"<b>License type:</b> {license_label}", styles["Normal"]),
        Paragraph(f"<b>Order:</b> {xml_escape(order.invoice_number or str(order.pk))}", styles["Normal"]),
        Spacer(1, 0.25 * inch),
        Paragraph(
            "This license is personal to the licensee named above and covers the item "
            "under the stated license type. The files may not be redistributed or resold. "
            "Every download is recorded against this order.",
            styles["Normal"],
        ),
        Spacer(1, 0.15 * inch),
        Paragraph(
            f"Verify this license: {xml_escape(license_verify_url(item.license_code))}",
            styles["Normal"],
        ),
    ]
    doc.build(story)
    return buffer.getvalue()
