"""Alıcı katalog fiyatı — mevcut pricing_service.quote; sahte fiyat yok."""

from __future__ import annotations

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from api.presenters.buyer import BuyerQuotePresenter
from firmalar.services.yetki_servisi import can_view_all_tenants
from fiyatlama.models import TedarikciTeklif
from fiyatlama.services.pricing_service import quote as create_quote
from tanimlar.models import SatisKanali
from urunler.models import Varyant

_GRAM_MODELLER = frozenset(
    {
        TedarikciTeklif.FiyatModeli.METAL_BAZLI,
        TedarikciTeklif.FiyatModeli.GRAM_BIRIM,
    }
)
_SABIT_MODELLER = frozenset({TedarikciTeklif.FiyatModeli.SABIT_PARCA})


def _fiyat_tipi_uyumlu(*, urun_fiyat_tipi: str, teklif_modeli: str) -> bool:
    tip = (urun_fiyat_tipi or "gram").strip().lower()
    if tip == "sabit":
        return teklif_modeli in _SABIT_MODELLER
    return teklif_modeli in _GRAM_MODELLER


def alici_varyant_fiyati(
    *,
    actor,
    varyant_id: int,
    satis_kanali_id: int,
    para_birimi: str = "TRY",
) -> dict:
    """
    Alıcı için net fiyat üretir (PriceQuote oluşturur).

    Dönüş: {ok: True, quote: <BuyerQuotePresenter>} veya
    {ok: False, reason_code, detail, varyant_id}.
    """
    if can_view_all_tenants(actor):
        return {
            "ok": False,
            "varyant_id": varyant_id,
            "reason_code": "ops_quote_yasak",
            "detail": "Ops alıcı quote üretemez; alıcı oturumu kullanın.",
        }

    firma = getattr(actor, "firma", None)
    if firma is None or not getattr(firma, "alici_mi", False):
        return {
            "ok": False,
            "varyant_id": varyant_id,
            "reason_code": "alici_gerekli",
            "detail": "Fiyat yalnız alıcı firmalar için üretilir.",
        }

    varyant = (
        Varyant.objects.select_related("urun", "urun__ayar", "renk", "beden")
        .filter(pk=varyant_id, aktif=True)
        .first()
    )
    if varyant is None:
        return {
            "ok": False,
            "varyant_id": varyant_id,
            "reason_code": "varyant_yok",
            "detail": "Varyant bulunamadı veya pasif.",
        }

    urun = varyant.urun
    if urun.onay_durumu != "onayli" or urun.yayin_durumu != "aktif":
        return {
            "ok": False,
            "varyant_id": varyant_id,
            "reason_code": "urun_yayinda_degil",
            "detail": "Ürün onaylı ve yayında değil; fiyat gösterilemez.",
        }

    kanal = SatisKanali.objects.filter(pk=satis_kanali_id, aktif=True).first()
    if kanal is None:
        return {
            "ok": False,
            "varyant_id": varyant_id,
            "reason_code": "kanal_yok",
            "detail": "Aktif satış kanalı bulunamadı.",
        }

    try:
        q = create_quote(
            alici_firma=firma,
            satis_kanali=kanal,
            varyant=varyant,
            kullanici=actor,
            para_birimi=(para_birimi or "TRY").upper(),
            now=timezone.now(),
        )
    except ValidationError as exc:
        msg = "; ".join(getattr(exc, "messages", None) or [str(exc)])
        code = "quote_uretilemedi"
        low = msg.lower()
        if "sözleşme" in low or "sozlesme" in low:
            code = "sozlesme_yok"
        elif "teklif" in low:
            code = "teklif_yok"
        elif "kur" in low or "sağlayıcı" in low or "saglayici" in low:
            code = "kur_yok"
        elif "gram" in low:
            code = "gram_eksik"
        return {
            "ok": False,
            "varyant_id": varyant_id,
            "reason_code": code,
            "detail": msg,
        }
    except PermissionDenied as exc:
        return {
            "ok": False,
            "varyant_id": varyant_id,
            "reason_code": "yetki_yok",
            "detail": str(exc),
        }

    teklif_modeli = getattr(getattr(q, "teklif", None), "fiyat_modeli", "") or ""
    uyari = None
    if teklif_modeli and not _fiyat_tipi_uyumlu(
        urun_fiyat_tipi=urun.fiyat_tipi, teklif_modeli=teklif_modeli
    ):
        uyari = (
            f"Ürün fiyat tipi '{urun.fiyat_tipi}' ile teklif modeli "
            f"'{teklif_modeli}' uyumsuz; gösterilen fiyat teklif motorundan."
        )

    presented = BuyerQuotePresenter(q)
    return {
        "ok": True,
        "varyant_id": varyant_id,
        "urun_id": urun.pk,
        "fiyat_tipi": urun.fiyat_tipi,
        "quote": presented,
        "uyari": uyari,
    }


def alici_varyant_fiyatlari_toplu(
    *,
    actor,
    satis_kanali_id: int,
    varyant_ids: list[int],
    para_birimi: str = "TRY",
) -> list[dict]:
    """En fazla 40 varyant; her biri bağımsız quote veya reason."""
    ids: list[int] = []
    seen: set[int] = set()
    for raw in varyant_ids:
        try:
            vid = int(raw)
        except (TypeError, ValueError):
            continue
        if vid in seen:
            continue
        seen.add(vid)
        ids.append(vid)
        if len(ids) >= 40:
            break
    return [
        alici_varyant_fiyati(
            actor=actor,
            varyant_id=vid,
            satis_kanali_id=satis_kanali_id,
            para_birimi=para_birimi,
        )
        for vid in ids
    ]
