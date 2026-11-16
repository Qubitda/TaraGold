"""ADR-0044 — montür↔taş uyumluluk (sıkı: kısıt boşsa imalata kapalı)."""

from __future__ import annotations

from decimal import Decimal


def montur_imalata_acik(montur) -> bool:
    """Montür imalat listesine girer mi? Sıkı kural."""
    if montur is None or getattr(montur, "tip", None) != "MONTUR":
        return False
    if not getattr(montur, "aktif", True):
        return False
    kesimler = getattr(montur, "izinli_kesimler", None) or []
    if not isinstance(kesimler, list) or len(kesimler) == 0:
        return False
    if getattr(montur, "yuva_adedi", None) in (None, 0):
        return False
    if getattr(montur, "karat_min", None) is None:
        return False
    if getattr(montur, "karat_max", None) is None:
        return False
    try:
        if Decimal(str(montur.karat_min)) > Decimal(str(montur.karat_max)):
            return False
    except Exception:  # noqa: BLE001
        return False
    return True


def tas_monture_uygun(*, montur, tas, adet: int = 1) -> bool:
    if not montur_imalata_acik(montur):
        return False
    if tas is None or getattr(tas, "tip", None) != "TAS":
        return False
    if not getattr(tas, "aktif", True):
        return False
    kod = (getattr(tas, "kesim_kod", None) or "").strip().upper()
    izinli = [
        str(x).strip().upper()
        for x in (getattr(montur, "izinli_kesimler", None) or [])
        if str(x).strip()
    ]
    if not kod or kod not in izinli:
        return False
    karat = getattr(tas, "karat", None)
    if karat is None:
        return False
    try:
        k = Decimal(str(karat)) * Decimal(adet)
        if k < Decimal(str(montur.karat_min)) or k > Decimal(str(montur.karat_max)):
            return False
    except Exception:  # noqa: BLE001
        return False
    yuva = int(montur.yuva_adedi or 0)
    if adet < 1 or adet > yuva:
        return False
    return True


def present_uyumluluk(montur) -> dict:
    return {
        "imalata_acik": montur_imalata_acik(montur),
        "yuva_adedi": getattr(montur, "yuva_adedi", None),
        "izinli_kesimler": list(getattr(montur, "izinli_kesimler", None) or []),
        "karat_min": str(montur.karat_min)
        if getattr(montur, "karat_min", None) is not None
        else None,
        "karat_max": str(montur.karat_max)
        if getattr(montur, "karat_max", None) is not None
        else None,
    }
