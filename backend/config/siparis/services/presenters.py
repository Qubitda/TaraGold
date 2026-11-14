"""Alıcı/ops API sunum DTO — kör havuz (tedarikçi/maliyet yok)."""

from __future__ import annotations

from api.masking import assert_masked
from siparis.models import Order, OrderLine
from siparis.services.cart_servisi import present_cart_line


def present_order_line(line: OrderLine) -> dict:
    varyant = getattr(line, "varyant", None)
    urun = getattr(varyant, "urun", None) if varyant else None
    data = {
        "id": line.pk,
        "varyant_id": line.varyant_id,
        "varyant_sku": getattr(varyant, "sku", "") or "",
        "urun_ad": getattr(urun, "ad", "") or "",
        "miktar": str(line.miktar),
        "birim": line.birim,
        "snapshot_birim_fiyat_vergisiz": str(line.snapshot_birim_fiyat_vergisiz),
        "snapshot_satir_tutari_vergisiz": str(line.snapshot_satir_tutari_vergisiz),
        "para_birimi": line.para_birimi,
    }
    assert_masked(data)
    return data


def present_order(order: Order, *, include_lines: bool = True) -> dict:
    alici = getattr(order, "alici_firma", None)
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
        "line_count": order.lines.count(),
    }
    if include_lines:
        data["lines"] = [
            present_order_line(ln)
            for ln in order.lines.select_related("varyant", "varyant__urun")
            .all()
            .order_by("pk")
        ]
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
