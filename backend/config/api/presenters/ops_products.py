"""ADR-0030 — ops ürün DTO (olusturan_firma ops'ta; tedarikçi maliyet/SKU yok)."""

from __future__ import annotations

from api.masking import assert_masked
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import has_perm


def _allowed_actions(urun, user) -> list[str]:
    actions: list[str] = ["view"]
    if has_perm(user, P["submit_urun"]) and urun.yayin_durumu != "aktif":
        actions.append("edit")
    if has_perm(user, P["submit_urun"]) and urun.onay_durumu in (
        "taslak",
        "reddedildi",
    ):
        actions.append("submit")
        actions.append("add_variant")
        actions.append("delete")
    if has_perm(user, P["approve_urun"]) and urun.onay_durumu == "onay_bekliyor":
        actions.extend(["approve", "reject"])
    if has_perm(user, P["publish_urun"]) and urun.onay_durumu == "onayli":
        if urun.yayin_durumu != "aktif":
            actions.append("publish")
        if urun.yayin_durumu in ("aktif", "yakinda"):
            actions.append("unpublish")
    return actions


def present_ops_variant(v) -> dict:
    data = {
        "id": v.pk,
        "sku": v.sku or "",
        "tedarikci_sku": v.tedarikci_sku or "",
        "gram": str(v.gram) if v.gram is not None else None,
        "sabit_fiyat": str(v.sabit_fiyat) if v.sabit_fiyat is not None else None,
        "renk_id": v.renk_id,
        "renk": getattr(getattr(v, "renk", None), "ad", "") or "",
        "beden_id": v.beden_id,
        "beden": getattr(getattr(v, "beden", None), "deger", "") or "",
        "ek_bedel": str(v.ek_bedel) if v.ek_bedel is not None else "0",
        "benzersiz_parca": bool(v.benzersiz_parca),
        "aktif": bool(v.aktif),
    }
    assert_masked(data)
    return data


def present_ops_product(urun, *, user, include_variants: bool = False) -> dict:
    varyant_count = getattr(urun, "varyant_count", None)
    if varyant_count is None:
        varyant_count = urun.varyantlar.filter(aktif=True).count()
    kat = getattr(urun, "kategori", None)
    teknikler = list(urun.teknikler.all().values("id", "ad"))
    stiller = list(urun.stiller.all().values("id", "ad"))
    ozel_gunler = list(urun.ozel_gunler.all().values("id", "ad"))
    data = {
        "id": urun.pk,
        "ad": urun.ad,
        "platform_kodu": urun.platform_kodu or "",
        "aciklama": urun.aciklama or "",
        "kategori_id": urun.kategori_id,
        "kategori": getattr(kat, "ad", "") or "",
        "kategori_sira": getattr(kat, "sira", 0) or 0,
        "kategori_one_cikan": bool(getattr(kat, "one_cikan", False)),
        "ayar_id": urun.ayar_id,
        "ayar": getattr(getattr(urun, "ayar", None), "ayar_kodu", "") or "",
        "fiyat_tipi": urun.fiyat_tipi,
        "temin_tipi": urun.temin_tipi,
        "termin_gun": urun.termin_gun,
        "renk_ekseni": bool(urun.renk_ekseni),
        "olcu_tipi": urun.olcu_tipi or "",
        "koleksiyon_id": urun.koleksiyon_id,
        "koleksiyon": getattr(getattr(urun, "koleksiyon", None), "ad", "") or "",
        "hedef_kitle": urun.hedef_kitle or "",
        "yas_grubu_id": urun.yas_grubu_id,
        "yas_grubu": getattr(getattr(urun, "yas_grubu", None), "ad", "") or "",
        "yuzey": urun.yuzey or "",
        "zincir_tipi_id": urun.zincir_tipi_id,
        "zincir_tipi": getattr(getattr(urun, "zincir_tipi", None), "ad", "") or "",
        "kopca_tipi_id": urun.kopca_tipi_id,
        "kopca_tipi": getattr(getattr(urun, "kopca_tipi", None), "ad", "") or "",
        "teknik_ids": [t["id"] for t in teknikler],
        "teknikler": [t["ad"] for t in teknikler],
        "stil_ids": [s["id"] for s in stiller],
        "stiller": [s["ad"] for s in stiller],
        "ozel_gun_ids": [o["id"] for o in ozel_gunler],
        "ozel_gunler": [o["ad"] for o in ozel_gunler],
        "onay_durumu": urun.onay_durumu,
        "yayin_durumu": urun.yayin_durumu,
        "red_nedeni": urun.red_nedeni or "",
        "olusturan_firma_id": urun.olusturan_firma_id,
        "varyant_count": int(varyant_count),
        "allowed_actions": _allowed_actions(urun, user),
    }
    if include_variants:
        data["varyantlar"] = [
            present_ops_variant(v)
            for v in urun.varyantlar.select_related("renk", "beden").all().order_by("pk")
        ]
        data["kanallar"] = [
            {
                "id": uk.pk,
                "kanal_id": uk.kanal_id,
                "kod": uk.kanal.kod,
                "ad": uk.kanal.ad,
                "aktif": bool(uk.aktif),
            }
            for uk in urun.kanallar.select_related("kanal").all().order_by("kanal__sira")
        ]
    assert_masked(data)
    return data
