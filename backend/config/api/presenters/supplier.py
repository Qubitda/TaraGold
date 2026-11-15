"""B6 — Tedarikçi DTO; ters kör havuz (alıcı kimliği yok)."""

from __future__ import annotations

from django.utils import timezone

from api.masking import assert_masked
from fiyatlama.models import TedarikciTeklif
from stok.models import StockBalance, StockMovement, Warehouse


def present_offer(teklif: TedarikciTeklif, *, can_manage: bool = False) -> dict:
    """Kendi teklifi — fiyat alanları tedarikçiye açık; alıcı kimliği yok."""
    actions: list[str] = []
    if can_manage:
        if teklif.durum == TedarikciTeklif.Durum.TASLAK:
            actions.append("submit")
        if teklif.durum == TedarikciTeklif.Durum.YAYINDA:
            actions.extend(["deactivate", "new_version"])
    varyant = getattr(teklif, "varyant", None)
    urun = getattr(varyant, "urun", None) if varyant else None
    data = {
        "id": teklif.pk,
        "varyant_id": teklif.varyant_id,
        "varyant_sku": getattr(varyant, "sku", "") or "",
        "urun_ad": getattr(urun, "ad", "") or "",
        "platform_kodu": getattr(urun, "platform_kodu", "") or "",
        "tedarikci_kodu": teklif.tedarikci_kodu,
        "versiyon": teklif.versiyon,
        "durum": teklif.durum,
        "fiyat_modeli": teklif.fiyat_modeli,
        "temin_tipi": teklif.temin_tipi,
        "uretim_suresi_gun": teklif.uretim_suresi_gun,
        "gram": str(teklif.gram) if teklif.gram is not None else None,
        "birim_fiyat": str(teklif.birim_fiyat)
        if teklif.birim_fiyat is not None
        else None,
        "iscilik_override": str(teklif.iscilik_override)
        if teklif.iscilik_override is not None
        else None,
        "para_birimi": teklif.para_birimi,
        "gecerlilik_baslangic": teklif.gecerlilik_baslangic.isoformat()
        if teklif.gecerlilik_baslangic
        else None,
        "gecerlilik_bitis": teklif.gecerlilik_bitis.isoformat()
        if teklif.gecerlilik_bitis
        else None,
        "allowed_actions": actions,
        "server_now": timezone.now().isoformat(),
    }
    assert_masked(data)
    return data


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
    teklif = getattr(bal, "teklif", None)
    item = {
        "id": bal.pk,
        "warehouse_id": bal.warehouse_id,
        "warehouse_kod": getattr(wh, "kod", "") or "",
        "warehouse_ad": getattr(wh, "ad", "") or "",
        "teklif_id": bal.teklif_id,
        "teklif_kodu": getattr(teklif, "tedarikci_kodu", "") or "",
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
        "teklif_id": mv.teklif_id,
        "varyant_id": mv.varyant_id,
        "birim": mv.birim,
        "miktar": str(mv.miktar),
        "tip": mv.tip,
        "neden": mv.neden,
    }
    assert_masked(item)
    return item
