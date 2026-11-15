"""Ops fiyat önizleme — VaryantFiyat (teklif yok)."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied

from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import require_perm
from fiyatlama.models import VaryantFiyat
from fiyatlama.services.varyant_fiyat_servisi import get_aktif
from urunler.models import Varyant


def ops_fiyat_onizleme(*, actor, varyant: Varyant) -> dict:
    require_perm(actor, P["submit_urun"], message="Fiyat önizleme yetkiniz yok.")
    firma = getattr(actor, "firma", None)
    if not (firma and getattr(firma, "platform_mu", False)):
        raise PermissionDenied("Ops fiyat önizleme yalnız platform.")

    urun = varyant.urun
    vf = get_aktif(varyant)
    base = {
        "available": False,
        "varyant_id": varyant.pk,
        "urun_id": urun.pk,
        "fiyat_tipi": urun.fiyat_tipi,
        "gram": str(varyant.gram) if varyant.gram is not None else None,
        "ek_bedel": str(varyant.ek_bedel) if varyant.ek_bedel is not None else "0",
        "sabit_fiyat": str(varyant.sabit_fiyat) if varyant.sabit_fiyat is not None else None,
        "katalog_tas_bedeli": str(varyant.katalog_tas_bedeli())
        if hasattr(varyant, "katalog_tas_bedeli")
        else "0",
        "aciklama": {
            "gram_bazli": (
                "Gram × milyem × saf + işçilik + servis + taş + ek; 2 hop."
            ),
            "sabit": "VaryantFiyat SABIT_PARCA + servis bedeli.",
            "satin_alma": "Alıcı: varyant → POST /quotes/ → sepet.",
        },
        "onay_durumu": urun.onay_durumu,
        "yayin_durumu": urun.yayin_durumu,
        "aktif_fiyat_var": vf is not None,
    }

    if urun.yayin_durumu != "aktif" or urun.onay_durumu != "onayli":
        return {
            **base,
            "reason_code": "urun_henuz_yayinda_degil",
            "detail": "Alıcı quote ancak onaylı+yayında üründe üretilir.",
            "hint": "Varyant fiyatı girip yayınlayın.",
        }

    if vf is None:
        return {
            **base,
            "reason_code": "varyant_fiyat_gerekli",
            "detail": "Bu varyant için aktif VaryantFiyat yok.",
            "hint": "Stok & Fiyat ekranından birim fiyat girin.",
        }

    return {
        **base,
        "available": True,
        "reason_code": "fiyat_hazir",
        "teklif": {  # FE geriye uyum anahtarı
            "id": vf.pk,
            "fiyat_modeli": vf.fiyat_modeli,
            "birim_fiyat": str(vf.birim_fiyat) if vf.birim_fiyat is not None else None,
            "para_birimi": vf.para_birimi or "",
            "versiyon": vf.versiyon,
        },
        "varyant_fiyat": {
            "id": vf.pk,
            "fiyat_modeli": vf.fiyat_modeli,
            "birim_fiyat": str(vf.birim_fiyat) if vf.birim_fiyat is not None else None,
            "para_birimi": vf.para_birimi or "",
            "versiyon": vf.versiyon,
        },
        "hint": "Alıcı net fiyat için POST /quotes/.",
    }
