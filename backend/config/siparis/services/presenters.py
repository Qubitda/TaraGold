"""Alıcı/ops API sunum DTO — kör havuz (tedarikçi/maliyet yok)."""

from __future__ import annotations

from decimal import Decimal

from api.masking import assert_masked
from siparis.models import Order, OrderLine
from siparis.services.cart_servisi import present_cart_line


def present_order_line(line: OrderLine) -> dict:
    varyant = getattr(line, "varyant", None)
    urun = getattr(varyant, "urun", None) if varyant else None
    tahmini_b = line.tahmini_birim_fiyat_vergisiz
    tahmini_s = line.tahmini_satir_tutari_vergisiz
    kesin_b = line.snapshot_birim_fiyat_vergisiz
    kesin_s = line.snapshot_satir_tutari_vergisiz
    has_kesin = line.has_gram is not None
    kesin_mi = has_kesin or kesin_s is not None
    fark = None
    if kesin_s is not None and tahmini_s is not None:
        fark = str(
            (Decimal(kesin_s) - Decimal(tahmini_s)).quantize(Decimal("0.01"))
        )
    data = {
        "id": line.pk,
        "varyant_id": line.varyant_id,
        "varyant_sku": getattr(varyant, "sku", "") or "",
        "urun_ad": getattr(urun, "ad", "") or "",
        "miktar": str(line.miktar),
        "birim": line.birim,
        "gram_toplam": str(line.gram_toplam) if line.gram_toplam is not None else None,
        "milyem": str(line.milyem) if line.milyem is not None else None,
        "iscilik_birimi": line.iscilik_birimi or None,
        "tahmini_has_gram": (
            str(line.tahmini_has_gram) if line.tahmini_has_gram is not None else None
        ),
        "has_gram": str(line.has_gram) if line.has_gram is not None else None,
        "tl_borc": str(line.tl_borc) if line.tl_borc is not None else None,
        "yaklasik_tl": str(tahmini_s) if tahmini_s is not None else None,
        "yaklasik_tl_etiket": "ödeme anındaki kurla netleşir",
        "tahmini_birim_fiyat_vergisiz": str(tahmini_b) if tahmini_b is not None else None,
        "tahmini_satir_tutari_vergisiz": str(tahmini_s) if tahmini_s is not None else None,
        "snapshot_birim_fiyat_vergisiz": str(kesin_b) if kesin_b is not None else None,
        "snapshot_satir_tutari_vergisiz": str(kesin_s) if kesin_s is not None else None,
        "fiyat_kesin": kesin_mi,
        "has_kesin": has_kesin,
        "fark_vergisiz": fark,
        "para_birimi": line.para_birimi,
        "price_quote_id": line.price_quote_id,
    }
    assert_masked(data)
    return data


def present_order(order: Order, *, include_lines: bool = True) -> dict:
    alici = getattr(order, "alici_firma", None)
    co = getattr(order, "checkout_attempt", None)
    co_sonuc = (getattr(co, "sonuc", None) or {}) if co is not None else {}
    lines_qs = list(
        order.lines.select_related("varyant", "varyant__urun").all().order_by("pk")
    )
    tahmini_toplam = Decimal("0")
    kesin_toplam = Decimal("0")
    tahmini_has = Decimal("0")
    kesin_has = Decimal("0")
    tl_borc_toplam = Decimal("0")
    has_kesin = False
    has_gram_kesin = False
    for ln in lines_qs:
        if ln.tahmini_satir_tutari_vergisiz is not None:
            tahmini_toplam += Decimal(ln.tahmini_satir_tutari_vergisiz)
        if ln.snapshot_satir_tutari_vergisiz is not None:
            kesin_toplam += Decimal(ln.snapshot_satir_tutari_vergisiz)
            has_kesin = True
        if ln.tahmini_has_gram is not None:
            tahmini_has += Decimal(ln.tahmini_has_gram)
        if ln.has_gram is not None:
            kesin_has += Decimal(ln.has_gram)
            has_gram_kesin = True
        if ln.tl_borc is not None:
            tl_borc_toplam += Decimal(ln.tl_borc)
    data = {
        "id": order.pk,
        "durum": order.durum,
        "alici_firma_id": order.alici_firma_id,
        "alici_firma_ad": getattr(alici, "ad", "") if alici else "",
        "sube_id": order.sube_id,
        "idempotency_key": order.idempotency_key,
        "olusturma_tarihi": order.olusturma_tarihi.isoformat()
        if order.olusturma_tarihi
        else None,
        "line_count": len(lines_qs),
        "tahmini_has_gram": str(tahmini_has.quantize(Decimal("0.0001"))),
        "has_gram": (
            str(kesin_has.quantize(Decimal("0.0001"))) if has_gram_kesin else None
        ),
        "tl_borc": (
            str(tl_borc_toplam.quantize(Decimal("0.01"))) if has_gram_kesin else None
        ),
        "yaklasik_tl": str(tahmini_toplam.quantize(Decimal("0.01"))),
        "yaklasik_tl_etiket": "ödeme anındaki kurla netleşir",
        "tahmini_toplam_vergisiz": str(tahmini_toplam.quantize(Decimal("0.01"))),
        "kesin_toplam_vergisiz": (
            str(kesin_toplam.quantize(Decimal("0.01"))) if has_kesin else None
        ),
        "fark_toplam_vergisiz": (
            str((kesin_toplam - tahmini_toplam).quantize(Decimal("0.01")))
            if has_kesin
            else None
        ),
        "fiyat_kesin": has_kesin or has_gram_kesin,
        "has_kesin": has_gram_kesin,
        "teslimat_adresi": co_sonuc.get("teslimat_adresi"),
        "fatura_adresi": co_sonuc.get("fatura_adresi"),
        "siparis_notu": co_sonuc.get("siparis_notu") or "",
    }
    if include_lines:
        data["lines"] = [present_order_line(ln) for ln in lines_qs]
    assert_masked(data)
    return data


def present_cart(cart, *, include_lines: bool = True) -> dict:
    data = {
        "id": cart.pk,
        "alici_firma_id": cart.alici_firma_id,
        "sube_id": getattr(cart, "sube_id", None),
        "line_count": cart.lines.count(),
    }
    if include_lines:
        data["lines"] = [
            present_cart_line(ln) for ln in cart.lines.select_related("price_quote")
        ]
    assert_masked(data)
    return data
