"""ADR-0041 — firma pano başlığı + ek marj."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.core.exceptions import ValidationError

from piyasa.models import FirmaPanoTercih
from piyasa.services import hesap


def _q(v: Decimal) -> Decimal:
    return v.quantize(hesap.HASSASIYET, rounding=ROUND_HALF_UP)


def get_or_default(firma) -> FirmaPanoTercih | None:
    if firma is None:
        return None
    return FirmaPanoTercih.objects.filter(firma_id=firma.pk).select_related("firma").first()


def etkin_baslik(*, firma, platform_baslik: str = "") -> str:
    """Kuyumcu: tercih veya firma.ad. Platform: global başlık veya firma.ad."""
    if firma is None:
        return (platform_baslik or "").strip()
    if getattr(firma, "platform_mu", False):
        return (platform_baslik or "").strip() or (firma.ad or "").strip()
    tercih = get_or_default(firma)
    if tercih:
        return tercih.etkin_baslik
    return (firma.ad or "").strip()


def uygula_ek_marj(
    alis: Decimal | None,
    satis: Decimal | None,
    *,
    tercih: FirmaPanoTercih | None,
) -> tuple[Decimal | None, Decimal | None]:
    """Platform nihai üzerine firma ek marjı."""
    if tercih is None:
        return alis, satis
    tip = (tercih.marj_tipi or hesap.YUZDE).upper()
    a = alis
    s = satis
    if a is not None:
        a = hesap.uygula_pano_marj(
            a,
            taraf=hesap.ALIS,
            marj_modu=tip,
            alis_marj=tercih.alis_marj,
            satis_marj=tercih.satis_marj,
        )
        a = _q(a)
    if s is not None:
        s = hesap.uygula_pano_marj(
            s,
            taraf=hesap.SATIS,
            marj_modu=tip,
            alis_marj=tercih.alis_marj,
            satis_marj=tercih.satis_marj,
        )
        s = _q(s)
    if a is not None and s is not None:
        hesap.dogrula_nihai_cift(a, s)
    return a, s


def present_tercih(firma) -> dict[str, Any]:
    tercih = get_or_default(firma)
    if tercih is None:
        return {
            "firma_id": firma.pk,
            "firma_ad": firma.ad,
            "pano_baslik": "",
            "etkin_baslik": (firma.ad or "").strip(),
            "marj_tipi": FirmaPanoTercih.MarjTipi.YUZDE,
            "alis_marj": "0",
            "satis_marj": "0",
        }
    return {
        "firma_id": firma.pk,
        "firma_ad": firma.ad,
        "pano_baslik": tercih.pano_baslik or "",
        "etkin_baslik": tercih.etkin_baslik,
        "marj_tipi": tercih.marj_tipi,
        "alis_marj": str(tercih.alis_marj),
        "satis_marj": str(tercih.satis_marj),
        "guncelleme": tercih.guncelleme.isoformat() if tercih.guncelleme else None,
    }


def upsert_tercih(firma, *, data: dict, actor=None) -> FirmaPanoTercih:
    if firma is None:
        raise ValidationError({"firma": "Firma yok."})
    if getattr(firma, "platform_mu", False):
        raise ValidationError(
            {"firma": "Platform firması alıcı pano tercihi kullanmaz; ops başlığını kullanın."}
        )
    tercih, _ = FirmaPanoTercih.objects.get_or_create(firma=firma)
    if "pano_baslik" in data:
        tercih.pano_baslik = str(data.get("pano_baslik") or "").strip()[:80]
    if "marj_tipi" in data:
        tip = str(data.get("marj_tipi") or "").upper()
        if tip not in {FirmaPanoTercih.MarjTipi.TL, FirmaPanoTercih.MarjTipi.YUZDE}:
            raise ValidationError({"marj_tipi": "TL veya YUZDE olmalı."})
        tercih.marj_tipi = tip
    for key in ("alis_marj", "satis_marj"):
        if key not in data:
            continue
        try:
            setattr(tercih, key, Decimal(str(data.get(key))))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValidationError({key: "Geçersiz sayı."}) from exc
    tercih.full_clean()
    tercih.save()
    return tercih
