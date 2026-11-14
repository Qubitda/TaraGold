"""ADR-0037 — ops fiyat önizleme (motor rewrite yok; sahte fiyat yok)."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied
from django.utils import timezone

from firmalar.role_permissions import P
from firmalar.services.yetki_servisi import require_perm
from fiyatlama.models import TedarikciTeklif
from fiyatlama.services.pricing_service import _teklif_gecerli_mi, sec_teklif
from urunler.models import Varyant


def ops_fiyat_onizleme(*, actor, varyant: Varyant) -> dict:
    """Yetkili ops için eğitim + teklif durumu; draft’ta quote üretilmez."""
    require_perm(actor, P["submit_urun"], message="Fiyat önizleme yetkiniz yok.")
    firma = getattr(actor, "firma", None)
    if not (firma and getattr(firma, "platform_mu", False)):
        raise PermissionDenied("Ops fiyat önizleme yalnız platform.")

    urun = varyant.urun
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
                "Gram × metal birim + işçilik + teklif taş bedeli + ek bedel; "
                "kanal/marj politikası alıcı quote’ta uygulanır."
            ),
            "sabit": "Varyant sabit fiyat + ek bedel; teklif modeli SABIT_PARCA ile hizalanır.",
            "tas_bedeli": (
                "Katalog UrunTasi.bedel vitrindir; quote taş maliyeti "
                "TeklifTasMaliyeti üzerinden gelir (K-011)."
            ),
            "satin_alma": "Alıcı: varyant → POST /quotes/ → POST /carts/me/lines/ (quote_id).",
        },
        "onay_durumu": urun.onay_durumu,
        "yayin_durumu": urun.yayin_durumu,
    }

    bugun = timezone.localdate()
    yayinda_teklif_qs = TedarikciTeklif.objects.filter(
        varyant=varyant, durum=TedarikciTeklif.Durum.YAYINDA
    )
    adaylar = [t for t in yayinda_teklif_qs if _teklif_gecerli_mi(t, bugun=bugun)]
    base["yayinda_teklif_sayisi"] = len(adaylar)

    if urun.yayin_durumu != "aktif" or urun.onay_durumu != "onayli":
        return {
            **base,
            "reason_code": "urun_henuz_yayinda_degil",
            "detail": "Alıcı quote ancak onaylı+yayında üründe üretilir.",
            "hint": "Varyant ve teklif hazır olduktan sonra yayınlayın; önizleme maliyet uydurmaz.",
        }

    if not adaylar:
        return {
            **base,
            "reason_code": "teklif_gerekli",
            "detail": "Bu varyant için geçerli YAYINDA tedarikçi teklifi yok.",
            "hint": "Tedarikçi teklifi yayınlanmadan alıcı fiyatı oluşmaz.",
        }

    try:
        teklif = sec_teklif(varyant, bugun=bugun)
    except Exception as exc:  # noqa: BLE001 — önizleme; motor exception → hint
        return {
            **base,
            "reason_code": "teklif_secilemedi",
            "detail": str(exc),
            "hint": "Teklif seçimi başarısız; kur/eşleşme kontrol edin.",
        }

    return {
        **base,
        "available": True,
        "reason_code": "teklif_hazir",
        "teklif": {
            "id": teklif.pk,
            "fiyat_modeli": teklif.fiyat_modeli,
            "birim_fiyat": str(teklif.birim_fiyat) if teklif.birim_fiyat is not None else None,
            "para_birimi": teklif.para_birimi or "",
            "versiyon": teklif.versiyon,
        },
        "hint": "Alıcı net fiyat için alıcı oturumuyla POST /quotes/ kullanın (ops quote üretemez).",
    }
