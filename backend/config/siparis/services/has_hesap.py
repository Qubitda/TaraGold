"""Has gram / TL borç hesap yardımcıları (ADR-0001)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError

from finans.constants import HAS_KODU, Q2, Q4, TRY_KODU, USD_KODU
from siparis.birim_constants import SepetBirimi

_CENT = Q2
_HAS = Q4


def q2(value: Decimal) -> Decimal:
    return Decimal(value).quantize(_CENT, rounding=ROUND_HALF_UP)


def q4(value: Decimal) -> Decimal:
    return Decimal(value).quantize(_HAS, rounding=ROUND_HALF_UP)


def resolve_milyem(*, quote=None, varyant=None, line=None) -> Decimal:
    if line is not None and getattr(line, "milyem", None) is not None:
        return Decimal(line.milyem)
    if quote is not None:
        hg = getattr(quote, "hesap_girdisi", None) or {}
        if isinstance(hg, dict) and hg.get("milyem") is not None:
            return Decimal(str(hg["milyem"]))
    urun = getattr(varyant, "urun", None) if varyant is not None else None
    ayar = getattr(urun, "ayar", None) if urun is not None else None
    if ayar is not None and getattr(ayar, "milyem", None) is not None:
        return Decimal(ayar.milyem)
    raise ValidationError("Milyem çözülemedi.")


def resolve_gram_toplam(*, miktar: Decimal, birim: str, quote=None, line=None) -> Decimal:
    if line is not None and getattr(line, "gram_toplam", None) is not None:
        return Decimal(line.gram_toplam)
    if birim == SepetBirimi.GRAM:
        return q4(miktar)
    # ADET: quote.gram × miktar
    qg = getattr(quote, "gram", None) if quote is not None else None
    if qg is None or Decimal(qg) <= 0:
        raise ValidationError("ADET satır için PriceQuote.gram zorunlu.")
    return q4(Decimal(qg) * miktar)


def iscilik_has_tutari(*, vf, miktar: Decimal, gram_toplam: Decimal) -> Decimal:
    """VaryantFiyat işçilik HAS biriminde → has gram katkısı."""
    raw = Decimal(vf.iscilik or 0)
    if raw <= 0:
        return Decimal("0.0000")
    tip = getattr(vf, "iscilik_tipi", "PARCA") or "PARCA"
    if tip == "GRAM":
        return q4(raw * gram_toplam)
    return q4(raw * miktar)


def iscilik_tl_tutari(*, vf, miktar: Decimal, gram_toplam: Decimal) -> Decimal:
    raw = Decimal(vf.iscilik or 0)
    if raw <= 0:
        return Decimal("0.00")
    tip = getattr(vf, "iscilik_tipi", "PARCA") or "PARCA"
    if tip == "GRAM":
        return q2(raw * gram_toplam)
    return q2(raw * miktar)


def metal_disi_tl_from_quote(quote, *, exclude_iscilik: bool) -> Decimal:
    """Quote kalemlerinden metal dışı TRY (bilgi / borç)."""
    kalemler = getattr(quote, "kalemler", None) or {}
    if not isinstance(kalemler, dict):
        return Decimal("0.00")
    skip = {"metal", "metal_maliyet", "has_gram"}
    if exclude_iscilik:
        skip.add("iscilik")
    total = Decimal("0.00")
    for tip, val in kalemler.items():
        if tip in skip:
            continue
        try:
            total += Decimal(str(val))
        except Exception:  # noqa: BLE001
            continue
    return q2(total)


def compute_line_has_tl(
    *,
    miktar: Decimal,
    birim: str,
    quote,
    vf,
    varyant=None,
    line=None,
) -> dict:
    """tahmini/kesin has + tl_borc + usd_borc (ADR-0001 v2 net altın)."""
    from siparis.services.bilesen_servisi import bilesen_borclar, resolve_tas_agirligi

    v = varyant or getattr(quote, "varyant", None) or getattr(line, "varyant", None)
    gram = resolve_gram_toplam(
        miktar=miktar, birim=birim, quote=quote, line=line
    )
    if line is not None and getattr(line, "tas_agirligi", None) is not None:
        tas = q4(line.tas_agirligi)
    else:
        tas = resolve_tas_agirligi(varyant=v, miktar=miktar, birim=birim)
    if line is not None and getattr(line, "net_altin_gram", None) is not None:
        net = q4(line.net_altin_gram)
    else:
        net = q4(gram - tas)
        if net < 0:
            raise ValidationError("net_altin_gram negatif olamaz.")
    milyem = resolve_milyem(quote=quote, varyant=v, line=line)
    metal_has = q4(net * milyem)
    isc_birim = (
        getattr(line, "iscilik_birimi", None)
        or getattr(vf, "iscilik_birimi", None)
        or "TL"
    )
    isc_birim = str(isc_birim).upper()
    bil = bilesen_borclar(varyant=v, miktar=miktar)
    if isc_birim == HAS_KODU:
        has_gram = q4(
            metal_has
            + iscilik_has_tutari(vf=vf, miktar=miktar, gram_toplam=net)
            + bil["has_extra"]
        )
        tl_borc = metal_disi_tl_from_quote(quote, exclude_iscilik=True)
        tl_borc = q2(
            tl_borc
            + Decimal(vf.tas_bedeli or 0)
            * (miktar if birim == SepetBirimi.ADET else Decimal("1"))
            + Decimal(vf.ek_bedel or 0)
            * (miktar if birim == SepetBirimi.ADET else Decimal("1"))
            + bil["tl"]
        )
    else:
        has_gram = q4(metal_has + bil["has_extra"])
        tl_isc = iscilik_tl_tutari(vf=vf, miktar=miktar, gram_toplam=net)
        tl_extra = metal_disi_tl_from_quote(quote, exclude_iscilik=True)
        tl_borc = q2(
            tl_isc
            + tl_extra
            + Decimal(vf.tas_bedeli or 0)
            * (miktar if birim == SepetBirimi.ADET else Decimal("1"))
            + Decimal(vf.ek_bedel or 0)
            * (miktar if birim == SepetBirimi.ADET else Decimal("1"))
            + bil["tl"]
        )
    usd_borc = bil["usd"]
    yaklasik_tl = None
    if quote is not None and getattr(quote, "toplam_vergisiz", None) is not None:
        if birim == SepetBirimi.ADET:
            yaklasik_tl = q2(Decimal(quote.toplam_vergisiz) * miktar)
        else:
            yaklasik_tl = q2(Decimal(quote.toplam_vergisiz))
    return {
        "gram_toplam": gram,
        "tas_agirligi": tas,
        "net_altin_gram": net,
        "milyem": milyem,
        "iscilik_birimi": isc_birim if isc_birim in (HAS_KODU, TRY_KODU, "TL") else "TL",
        "tahmini_has_gram": has_gram,
        "has_gram": has_gram,
        "tl_borc": tl_borc,
        "usd_borc": usd_borc,
        "yaklasik_tl": yaklasik_tl,
        "para_birimi": TRY_KODU,
        "usd_para_birimi": USD_KODU,
    }
