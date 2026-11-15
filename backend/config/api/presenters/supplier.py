"""B6 — Tedarikçi DTO; ters kör havuz (alıcı kimliği yok)."""

from __future__ import annotations

from api.masking import assert_masked
from stok.models import StockBalance, StockMovement, Warehouse


def present_warehouse(wh: Warehouse) -> dict:
    sahip = getattr(wh, "sahip_firma", None)
    item = {
        "id": wh.pk,
        "kod": wh.kod,
        "ad": wh.ad,
        "sahip_tipi": wh.sahip_tipi,
        "sahip_firma_id": wh.sahip_firma_id,
        "sahip_firma_ad": getattr(sahip, "ad", "") or "",
        "aktif": wh.aktif,
        "olusturma_tarihi": wh.olusturma_tarihi.isoformat()
        if wh.olusturma_tarihi
        else None,
    }
    assert_masked(item)
    return item


def present_balance(bal: StockBalance) -> dict:
    wh = getattr(bal, "warehouse", None)
    varyant = getattr(bal, "varyant", None)
    urun = getattr(varyant, "urun", None) if varyant else None
    item = {
        "id": bal.pk,
        "warehouse_id": bal.warehouse_id,
        "warehouse_kod": getattr(wh, "kod", "") or "",
        "warehouse_ad": getattr(wh, "ad", "") or "",
        "varyant_id": bal.varyant_id,
        "varyant_sku": getattr(varyant, "sku", "") or "",
        "urun_ad": getattr(urun, "ad", "") or "",
        "platform_kodu": getattr(urun, "platform_kodu", "") or "",
        "birim": bal.birim,
        "on_hand": str(bal.on_hand),
        "reserved": str(bal.reserved),
        "blocked": str(bal.blocked),
        "available": str(bal.available),
    }
    assert_masked(item)
    return item


def present_movement(mv: StockMovement) -> dict:
    item = {
        "id": mv.pk,
        "warehouse_id": mv.warehouse_id,
        "varyant_id": mv.varyant_id,
        "birim": mv.birim,
        "miktar": str(mv.miktar),
        "tip": mv.tip,
        "neden": mv.neden,
    }
    assert_masked(item)
    return item
