"""ADR-0030 — ops ürün DTO (olusturan_firma ops'ta; tedarikçi maliyet/SKU yok)."""

from __future__ import annotations

from api.masking import assert_masked
from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import has_perm
from urunler.services.gorsel_servisi import present_gorsel
from urunler.services.katalog_hazirlik_servisi import urun_hazirlik_durumu


def _allowed_actions(urun, user) -> list[str]:
    """Ürün çift onay yok: taslak → yayın. submit/approve/reject üretilmez."""
    actions: list[str] = ["view"]
    if has_perm(user, P["submit_urun"]) and urun.yayin_durumu != "aktif":
        actions.append("edit")
        actions.append("add_variant")
        actions.append("delete")
    if has_perm(user, P["publish_urun"]):
        if urun.yayin_durumu != "aktif":
            actions.append("publish")
        if urun.yayin_durumu in ("aktif", "yakinda"):
            actions.append("unpublish")
    return actions


def present_ops_variant(v) -> dict:
    from urunler.services.uyumluluk_servisi import montur_imalata_acik

    tip = getattr(v, "tip", None) or "HAM_ALTIN"
    data = {
        "id": v.pk,
        "sku": v.sku or "",
        "tip": tip,
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
        # ADR-0044
        "yuva_adedi": getattr(v, "yuva_adedi", None),
        "izinli_kesimler": list(getattr(v, "izinli_kesimler", None) or []),
        "karat_min": str(v.karat_min)
        if getattr(v, "karat_min", None) is not None
        else None,
        "karat_max": str(v.karat_max)
        if getattr(v, "karat_max", None) is not None
        else None,
        "karat": str(v.karat) if getattr(v, "karat", None) is not None else None,
        "kesim_kod": getattr(v, "kesim_kod", None) or "",
        "imalata_acik": montur_imalata_acik(v) if tip == "MONTUR" else False,
    }
    assert_masked(data)
    return data


def present_ops_product(
    urun,
    *,
    user,
    request=None,
    include_variants: bool = False,
    include_media: bool = False,
    include_hazirlik: bool = False,
) -> dict:
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
        "metal_id": getattr(getattr(urun, "ayar", None), "metal_id", None),
        "metal": getattr(
            getattr(getattr(urun, "ayar", None), "metal", None), "ad", ""
        )
        or "",
        "milyem": str(getattr(getattr(urun, "ayar", None), "milyem", "") or "")
        or None,
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
        "slug": urun.slug or "",
        "meta_baslik": urun.meta_baslik or "",
        "meta_aciklama": urun.meta_aciklama or "",
        "canonical_url": urun.canonical_url or "",
        "gorsel_alt_metni": urun.gorsel_alt_metni or "",
        "olusturan_kullanici_id": urun.olusturan_kullanici_id,
        "guncelleme_zamani": urun.guncelleme_zamani.isoformat()
        if getattr(urun, "guncelleme_zamani", None)
        else None,
    }
    if include_hazirlik or include_variants:
        data["hazirlik"] = urun_hazirlik_durumu(urun)
    else:
        data["hazirlik"] = None
    if include_variants:
        from urunler.services.urun_tasi_servisi import present_urun_tasi

        data["taslar"] = [
            present_urun_tasi(t)
            for t in urun.taslar.select_related("tas_tipi").order_by("pk")
        ]
    if include_media or include_variants:
        gorseller = list(urun.gorseller.all().order_by("sira", "pk"))
        data["gorseller"] = [
            present_gorsel(g, request=request) for g in gorseller
        ]
        data["kapak_url"] = next(
            (
                present_gorsel(g, request=request)["url"]
                for g in gorseller
                if g.kapak and not g.varyant_id
            ),
            "",
        )
    else:
        kapak = (
            urun.gorseller.filter(kapak=True, varyant__isnull=True)
            .order_by("sira", "pk")
            .first()
        )
        data["kapak_url"] = (
            present_gorsel(kapak, request=request)["url"] if kapak else ""
        )
        data["gorseller"] = []
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
