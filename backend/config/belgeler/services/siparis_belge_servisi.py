"""Proforma + İrsaliye + Kör Tedarikçi İrsaliyesi PDF — ADR-0034 / ADR-0036.

- Türkçe karakterler WinAnsi + /Differences Type1 font ile (veri kaybı yok).
- Proforma revizyon sayacı sipariş bazında 1, 2, 3... artar; QC ölçüm farklarını içerir; vergi/KDV satırı yoktur.
- İrsaliye başlık/alt metni BelgeAyarlari'ndan okunur; tedarikçi/marj/maliyet sızmaz.
- Tedarikçi İrsaliyesi kördür; alıcı kimliği/fiyatı/marjı içermez.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from api.masking import assert_masked
from belgeler.models import BelgeAyarlari, Document
from firmalar.models import Firma, FirmaAdresi
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import can_view_all_tenants, has_perm


@dataclass
class BelgeSonuc:
    document: Document
    pdf_bytes: bytes
    revizyon: int


_TR_DIFF_MAP = {
    "Ğ": "\\200",
    "ğ": "\\201",
    "İ": "\\202",
    "ı": "\\203",
    "Ş": "\\204",
    "ş": "\\205",
    "₺": "TL",
    "—": "-",
    "–": "-",
    "→": "->",
}


def _pdf_escape_line(text: str) -> str:
    out: list[str] = []
    for ch in text:
        if ch in _TR_DIFF_MAP:
            out.append(_TR_DIFF_MAP[ch])
            continue
        if ch in ("\\", "(", ")"):
            out.append("\\" + ch)
            continue
        code = ord(ch)
        if 32 <= code <= 126:
            out.append(ch)
            continue
        # WinAnsi (cp1252) içinde olan Türkçe karakterler: Ç(0xC7), Ö(0xD6), Ü(0xDC), ç(0xE7), ö(0xF6), ü(0xFC)
        try:
            raw = ch.encode("cp1252")
            for b in raw:
                out.append(f"\\{b:03o}")
        except UnicodeEncodeError:
            out.append(" ")
    return "".join(out)


def render_lines_pdf(lines: list[str]) -> bytes:
    """Bağımlılıksız, Türkçe Type1 WinAnsi+/Differences destekli çoklu sayfa PDF 1.4."""
    wrapped: list[str] = []
    for raw in lines:
        s = str(raw or "")
        if len(s) <= 88:
            wrapped.append(s)
        else:
            while len(s) > 88:
                wrapped.append(s[:88])
                s = "  " + s[88:]
            if s:
                wrapped.append(s)

    per_page = 48
    pages_lines = [
        wrapped[i : i + per_page] or [""]
        for i in range(0, max(1, len(wrapped)), per_page)
    ]

    # Obj 1: Catalog, Obj 2: Pages, Obj 3: Font, Obj 4: Encoding, then pairs (Page, Content)
    objs: list[bytes] = []
    page_refs: list[str] = []
    page_start_obj = 5
    for idx in range(len(pages_lines)):
        page_obj_num = page_start_obj + idx * 2
        page_refs.append(f"{page_obj_num} 0 R")

    objs.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objs.append(
        f"2 0 obj<< /Type /Pages /Kids [{' '.join(page_refs)}] /Count {len(pages_lines)} >>endobj\n".encode(
            "latin-1"
        )
    )
    objs.append(
        b"3 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding 4 0 R >>endobj\n"
    )
    objs.append(
        b"4 0 obj<< /Type /Encoding /BaseEncoding /WinAnsiEncoding "
        b"/Differences [ 128 /Gbreve /gbreve /Idotaccent /dotlessi /Scedilla /scedilla ] >>endobj\n"
    )

    for idx, plines in enumerate(pages_lines):
        page_obj_num = page_start_obj + idx * 2
        content_obj_num = page_obj_num + 1
        content_lines = ["BT", "/F1 10 Tf", "45 755 Td", "14 TL"]
        first = True
        for line in plines:
            safe = _pdf_escape_line(line)
            if first:
                content_lines.append(f"({safe}) Tj")
                first = False
            else:
                content_lines.append("T*")
                content_lines.append(f"({safe}) Tj")
        content_lines.append("ET")
        stream = "\n".join(content_lines).encode("latin-1")
        objs.append(
            f"{page_obj_num} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_obj_num} 0 R /Resources<< /Font<< /F1 3 0 R >> >> >>endobj\n".encode(
                "latin-1"
            )
        )
        objs.append(
            f"{content_obj_num} 0 obj<< /Length {len(stream)} >>stream\n".encode(
                "latin-1"
            )
            + stream
            + b"\nendstream\nendobj\n"
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


def render_document_pdf(doc: Document) -> bytes:
    """Document metadata içindeki deterministik pdf_lines üzerinden PDF üretir."""
    meta = doc.metadata or {}
    lines = meta.get("pdf_lines")
    if isinstance(lines, list) and lines:
        return render_lines_pdf([str(x) for x in lines])
    return render_lines_pdf(
        [
            doc.baslik,
            f"Belge #{doc.pk} | Tip: {doc.tip}",
            f"Tarih: {doc.olusturma_tarihi.date().isoformat() if doc.olusturma_tarihi else ''}",
            f"Anahtar: {doc.storage_key}",
        ]
    )


def _format_firma_adresi(firma: Firma, *, prefer_tip: str = "fatura") -> str:
    adresler = list(FirmaAdresi.objects.filter(firma_id=firma.pk).order_by("-varsayilan", "pk"))
    if not adresler:
        return ""
    chosen = next((a for a in adresler if a.tip == prefer_tip), None) or adresler[0]
    parts = [chosen.adres.strip()]
    loc = " / ".join(x for x in [chosen.ilce.strip(), chosen.il.strip()] if x)
    if loc:
        parts.append(loc)
    return ", ".join(p for p in parts if p)


def _next_revizyon(*, firma_id: int, belge_turu: str, tip: str, order_id: int) -> int:
    count = (
        Document.objects.filter(firma_id=firma_id)
        .filter(Q(tip=tip) | Q(metadata__belge_turu=belge_turu))
        .filter(metadata__order_id=order_id)
        .count()
    )
    return count + 1


def _qc_measurement_notes(order_id: int) -> dict[int, str]:
    from kalite.models import QualityMeasurement

    notes: dict[int, str] = {}
    qs = QualityMeasurement.objects.filter(inspection__order_id=order_id).order_by(
        "order_line_id", "-pk"
    )
    for m in qs:
        if m.order_line_id not in notes:
            notes[m.order_line_id] = (
                f"QC Ölçüm: beklenen {m.beklenen} -> ölçülen {m.olculen} {m.birim} ({m.sonuc})"
            )
    return notes


def uret_proforma(*, actor, order) -> BelgeSonuc:
    if not can_view_all_tenants(actor) and not has_perm(actor, P["manage_shipment"]):
        raise PermissionDenied("Proforma yalnız platform ops.")
    ayar = BelgeAyarlari.get_solo()
    rev = _next_revizyon(
        firma_id=order.alici_firma_id,
        belge_turu="PROFORMA",
        tip=Document.Tip.PROFORMA,
        order_id=order.pk,
    )
    disclaimer = ayar.proforma_disclaimer or "Resmi fatura yerine geçmez."
    alici = Firma.objects.get(pk=order.alici_firma_id)
    alici_adres = _format_firma_adresi(alici, prefer_tip="fatura")
    qc_notes = _qc_measurement_notes(order.pk)

    lines = [
        f"PROFORMA FATURA (REV {rev})",
        f"UYARI: {disclaimer}",
        f"Sipariş No: #{order.pk}   |   Tarih: {timezone.now().date().isoformat()}",
        f"Alıcı: {alici.unvan or alici.ad} ({alici.firma_kodu})",
    ]
    if alici.vergi_no or alici.vergi_dairesi:
        lines.append(
            f"Vergi Dairesi / No: {alici.vergi_dairesi or '-'} / {alici.vergi_no or '-'}"
        )
    if alici_adres:
        lines.append(f"Adres: {alici_adres}")
    lines.append("-" * 78)
    lines.append("Kalemler (Net Vergisiz Tutar):")

    totals_by_pb: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    order_lines = list(
        order.lines.select_related("varyant", "varyant__urun").order_by("pk")
    )
    for line in order_lines[:40]:
        varyant = getattr(line, "varyant", None)
        urun = getattr(varyant, "urun", None) if varyant else None
        kod = getattr(varyant, "sku", "") or getattr(urun, "platform_kodu", "")
        urun_ad = getattr(urun, "ad", "") or f"Kalem #{line.pk}"
        pb = (line.para_birimi or "TRY").upper()
        totals_by_pb[pb] += Decimal(line.snapshot_satir_tutari_vergisiz or "0.00")
        lines.append(
            f"- [{kod}] {urun_ad} | {line.miktar} {line.birim} x "
            f"{line.snapshot_birim_fiyat_vergisiz} = {line.snapshot_satir_tutari_vergisiz} {pb}"
        )
        if line.pk in qc_notes:
            lines.append(f"  {qc_notes[line.pk]}")

    lines.append("-" * 78)
    for pb, total in totals_by_pb.items():
        lines.append(f"TOPLAM ({pb}, KDV/Vergi Hariç): {total.quantize(Decimal('0.01'))} {pb}")
    lines.append(disclaimer)

    # Kör havuz: tedarikçi / maliyet / marj bilgisi yok
    pdf = render_lines_pdf(lines)
    key = f"proforma/order-{order.pk}-r{rev}-{hashlib.sha256(pdf).hexdigest()[:12]}.pdf"
    meta = {
        "belge_turu": "PROFORMA",
        "order_id": order.pk,
        "revizyon": rev,
        "disclaimer": disclaimer,
        "qc_olcumlu": bool(qc_notes),
        "pdf_lines": lines,
    }
    assert_masked(meta, context="buyer")
    with transaction.atomic():
        doc = Document.objects.create(
            firma_id=order.alici_firma_id,
            tip=Document.Tip.PROFORMA,
            baslik=f"Proforma Order#{order.pk} R{rev}",
            storage_key=key,
            content_type="application/pdf",
            byte_size=len(pdf),
            metadata=meta,
            olusturan=actor if getattr(actor, "pk", None) else None,
        )
    return BelgeSonuc(document=doc, pdf_bytes=pdf, revizyon=rev)


def uret_irsaliye(*, actor, order, shipment=None) -> BelgeSonuc:
    if not can_view_all_tenants(actor) and not has_perm(actor, P["manage_shipment"]):
        raise PermissionDenied("İrsaliye yalnız platform ops.")
    ayar = BelgeAyarlari.get_solo()
    title = ayar.irsaliye_baslik or "İrsaliye"
    footer = (
        ayar.irsaliye_alt_metin
        or "Hukuki geçerliliği mali müşavir teyidine tabidir."
    )
    rev = _next_revizyon(
        firma_id=order.alici_firma_id,
        belge_turu="IRSALIYE",
        tip=Document.Tip.IRSALIYE,
        order_id=order.pk,
    )
    alici = Firma.objects.get(pk=order.alici_firma_id)
    sevk_adres = _format_firma_adresi(alici, prefer_tip="sevk")
    qc_notes = _qc_measurement_notes(order.pk)

    lines = [
        f"{title} (REV {rev})",
        f"Sipariş No: #{order.pk}   |   Tarih: {timezone.now().date().isoformat()}",
        f"Sevk Edilen Alıcı: {alici.unvan or alici.ad} ({alici.firma_kodu})",
    ]
    if sevk_adres:
        lines.append(f"Teslimat Adresi: {sevk_adres}")
    if shipment is not None:
        lines.append(
            f"Sevkiyat #{shipment.pk} | Model: {getattr(shipment, 'teslim_modeli', '')} "
            f"| Yön: {getattr(shipment, 'sevk_yonu', '')}"
        )
        lines.append(
            f"Taşıyıcı: {getattr(shipment, 'kargo_firma', '') or '-'} | "
            f"Takip No: {getattr(shipment, 'takip_no', '') or '-'}"
        )
    lines.append("-" * 78)
    lines.append("Sevk Kalemleri:")
    for line in order.lines.select_related("varyant", "varyant__urun").order_by("pk")[:40]:
        varyant = getattr(line, "varyant", None)
        urun = getattr(varyant, "urun", None) if varyant else None
        kod = getattr(varyant, "sku", "") or getattr(urun, "platform_kodu", "")
        urun_ad = getattr(urun, "ad", "") or f"Kalem #{line.pk}"
        lines.append(f"- [{kod}] {urun_ad}: {line.miktar} {line.birim}")
        if line.pk in qc_notes:
            lines.append(f"  {qc_notes[line.pk]}")
    lines.append("-" * 78)
    lines.append(footer)

    # Kör havuz: tedarikçi kimliği ve iç maliyet yok
    pdf = render_lines_pdf(lines)
    key = f"irsaliye/order-{order.pk}-r{rev}-{hashlib.sha256(pdf).hexdigest()[:12]}.pdf"
    meta = {
        "belge_turu": "IRSALIYE",
        "order_id": order.pk,
        "shipment_id": getattr(shipment, "pk", None),
        "revizyon": rev,
        "baslik": title,
        "alt_metin": footer,
        "pdf_lines": lines,
    }
    assert_masked(meta, context="buyer")
    with transaction.atomic():
        doc = Document.objects.create(
            firma_id=order.alici_firma_id,
            tip=Document.Tip.IRSALIYE,
            baslik=f"{title} Order#{order.pk} R{rev}",
            storage_key=key,
            content_type="application/pdf",
            byte_size=len(pdf),
            metadata=meta,
            olusturan=actor if getattr(actor, "pk", None) else None,
        )
    return BelgeSonuc(document=doc, pdf_bytes=pdf, revizyon=rev)


def uret_tedarikci_irsaliye(
    *, actor, order, tedarikci_firma: Firma, shipment=None
) -> BelgeSonuc:
    """Kör tedarikçi sevk irsaliyesi — alıcı kimliği/fiyatı/marjı kesinlikle içermez."""
    is_ops = can_view_all_tenants(actor) or has_perm(actor, P["manage_shipment"])
    if not is_ops:
        actor_firma_id = getattr(actor, "firma_id", None)
        if not actor_firma_id or actor_firma_id != tedarikci_firma.pk:
            raise PermissionDenied("Bu tedarikçi irsaliyesine erişiminiz yok.")

    supplier_lines = list(
        order.lines.select_related(
            "varyant", "varyant__urun", "stock_reservation__teklif"
        )
        .filter(stock_reservation__teklif__tedarikci_id=tedarikci_firma.pk)
        .order_by("pk")
    )
    if not supplier_lines:
        raise PermissionDenied("Bu siparişte ilgili tedarikçiye ait satır yok.")

    ayar = BelgeAyarlari.get_solo()
    rev = _next_revizyon(
        firma_id=tedarikci_firma.pk,
        belge_turu="TEDARIKCI_IRSALIYE",
        tip=Document.Tip.TEDARIKCI_IRSALIYE,
        order_id=order.pk,
    )
    footer = (
        ayar.irsaliye_alt_metin
        or "Hukuki geçerliliği mali müşavir teyidine tabidir."
    )
    lines = [
        f"TEDARİKÇİ SEVK İRSALİYESİ (KÖR HAVUZ - REV {rev})",
        f"Hazırlama Siparişi: #{order.pk}   |   Tarih: {timezone.now().date().isoformat()}",
        f"Gönderen Tedarikçi: {tedarikci_firma.unvan or tedarikci_firma.ad} ({tedarikci_firma.firma_kodu})",
        "Teslim Alıcı: Platform Operasyon Merkezi (Alıcı kimliği maskeli)",
    ]
    if shipment is not None:
        lines.append(
            f"Sevkiyat #{shipment.pk} | Taşıyıcı: {getattr(shipment, 'kargo_firma', '') or '-'} | "
            f"Takip: {getattr(shipment, 'takip_no', '') or '-'}"
        )
    lines.append("-" * 78)
    lines.append("Hazırlanacak / Sevk Kalemleri:")
    for line in supplier_lines[:40]:
        varyant = getattr(line, "varyant", None)
        urun = getattr(varyant, "urun", None) if varyant else None
        kod = getattr(varyant, "sku", "") or getattr(urun, "platform_kodu", "")
        urun_ad = getattr(urun, "ad", "") or f"Kalem #{line.pk}"
        lines.append(
            f"- [{kod}] {urun_ad}: {line.miktar} {line.birim} "
            f"(Model: {getattr(line, 'teslim_modeli', 'PLATFORM_QC')})"
        )
    lines.append("-" * 78)
    lines.append(footer)

    pdf = render_lines_pdf(lines)
    key = (
        f"tedarikci-irsaliye/order-{order.pk}-t{tedarikci_firma.pk}-r{rev}-"
        f"{hashlib.sha256(pdf).hexdigest()[:12]}.pdf"
    )
    meta = {
        "belge_turu": "TEDARIKCI_IRSALIYE",
        "order_id": order.pk,
        "shipment_id": getattr(shipment, "pk", None),
        "revizyon": rev,
        "pdf_lines": lines,
    }
    assert_masked(meta, context="supplier")
    with transaction.atomic():
        doc = Document.objects.create(
            firma_id=tedarikci_firma.pk,
            tip=Document.Tip.TEDARIKCI_IRSALIYE,
            baslik=f"Tedarikçi İrsaliye Order#{order.pk} R{rev}",
            storage_key=key,
            content_type="application/pdf",
            byte_size=len(pdf),
            metadata=meta,
            olusturan=actor if getattr(actor, "pk", None) else None,
        )
    return BelgeSonuc(document=doc, pdf_bytes=pdf, revizyon=rev)
