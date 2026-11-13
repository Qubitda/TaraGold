"""Proforma + irsaliye PDF (minimal) — ADR-0034. Vergi alanları şablonda yok."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from belgeler.models import Document
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm


@dataclass
class BelgeSonuc:
    document: Document
    pdf_bytes: bytes
    revizyon: int


def _minimal_pdf(lines: list[str]) -> bytes:
    """Bağımlılıksız tek sayfa PDF (Metin)."""
    content_lines = ["BT", "/F1 11 Tf", "50 750 Td", "14 TL"]
    first = True
    for line in lines:
        safe = (
            line.replace("\\", "\\\\")
            .replace("(", "\\(")
            .replace(")", "\\)")
            .encode("latin-1", "replace")
            .decode("latin-1")
        )
        if first:
            content_lines.append(f"({safe}) Tj")
            first = False
        else:
            content_lines.append("T*")
            content_lines.append(f"({safe}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1")
    objs = []
    objs.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objs.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objs.append(
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
    )
    objs.append(
        f"4 0 obj<< /Length {len(stream)} >>stream\n".encode("latin-1")
        + stream
        + b"\nendstream\nendobj\n"
    )
    objs.append(
        b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
    )
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode("latin-1"))
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    out.extend(
        f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "latin-1"
        )
    )
    return bytes(out)


def _cfg(key: str, default: str) -> str:
    return str(getattr(settings, key, default) or default)


def uret_proforma(*, actor, order) -> BelgeSonuc:
    if not can_view_all_tenants(actor) and not has_perm(actor, P["manage_shipment"]):
        raise PermissionDenied("Proforma yalnız ops.")
    rev = int((order.pk or 0) % 1000) + 1
    disclaimer = _cfg(
        "PROFORMA_DISCLAIMER",
        "Resmi fatura yerine gecmez.",
    )
    lines = [
        f"PROFORMA REV {rev}",
        disclaimer,
        f"Order #{order.pk}",
        f"Tarih {timezone.now().date().isoformat()}",
    ]
    for line in order.lines.all()[:40]:
        lines.append(
            f"Line {line.pk}: {line.miktar} {line.birim} "
            f"{line.snapshot_satir_tutari_vergisiz} {line.para_birimi}"
        )
        # Vergi yok — gösterilmez
    pdf = _minimal_pdf(lines)
    key = f"proforma/order-{order.pk}-r{rev}-{hashlib.sha256(pdf).hexdigest()[:12]}.pdf"
    with transaction.atomic():
        doc = Document.objects.create(
            firma_id=order.alici_firma_id,
            tip=Document.Tip.DIGER,
            baslik=f"Proforma Order#{order.pk} R{rev}",
            storage_key=key,
            content_type="application/pdf",
            byte_size=len(pdf),
            metadata={
                "belge_turu": "PROFORMA",
                "order_id": order.pk,
                "revizyon": rev,
                "disclaimer": disclaimer,
            },
            olusturan=actor,
        )
    return BelgeSonuc(document=doc, pdf_bytes=pdf, revizyon=rev)


def uret_irsaliye(*, actor, order, shipment=None) -> BelgeSonuc:
    if not can_view_all_tenants(actor) and not has_perm(actor, P["manage_shipment"]):
        raise PermissionDenied("Irsaliye yalnız ops.")
    title = _cfg("IRSALIYE_BASLIK", "Irsaliye")
    footer = _cfg(
        "IRSALIYE_ALT_METIN",
        "Hukuki gecerlilik mali musavir teyidine tabidir.",
    )
    rev = 1
    lines = [
        title,
        footer,
        f"Order #{order.pk}",
        f"Sevkiyat #{getattr(shipment, 'pk', '')}",
        f"Kargo {getattr(shipment, 'kargo_firma', '')} "
        f"Takip {getattr(shipment, 'takip_no', '')}",
    ]
    for line in order.lines.all()[:40]:
        lines.append(f"Kalem {line.pk}: {line.miktar} {line.birim}")
    # Kör: tedarikçi adı yok (alıcı belgesi)
    pdf = _minimal_pdf(lines)
    key = f"irsaliye/order-{order.pk}-{hashlib.sha256(pdf).hexdigest()[:12]}.pdf"
    with transaction.atomic():
        doc = Document.objects.create(
            firma_id=order.alici_firma_id,
            tip=Document.Tip.DIGER,
            baslik=f"{title} Order#{order.pk}",
            storage_key=key,
            content_type="application/pdf",
            byte_size=len(pdf),
            metadata={
                "belge_turu": "IRSALIYE",
                "order_id": order.pk,
                "shipment_id": getattr(shipment, "pk", None),
                "revizyon": rev,
            },
            olusturan=actor,
        )
    return BelgeSonuc(document=doc, pdf_bytes=pdf, revizyon=rev)
