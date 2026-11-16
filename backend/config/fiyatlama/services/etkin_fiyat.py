"""FAZ 5 — etkin fiyat modeli: aktif VaryantFiyat varsa o; yoksa Urun.fiyat_tipi."""

from __future__ import annotations


def urun_fiyat_tipi_to_model(fiyat_tipi: str | None) -> str:
    t = (fiyat_tipi or "gram").strip().lower()
    if t == "sabit":
        return "SABIT_PARCA"
    return "GRAM_BIRIM"


def etkin_fiyat_modeli(urun, vf=None) -> dict:
    """Aktif VF varsa VF modeli geçerli; yoksa ürün fiyat_tipi.

    Dönüş: {kaynak, model, conflict}
    conflict: VF ile ürün tipi manuel/hesaplanan ekseninde çelişiyorsa True
    (geçerli yine VF).
    """
    urun_model = urun_fiyat_tipi_to_model(getattr(urun, "fiyat_tipi", None))

    if vf is None:
        from fiyatlama.models import VaryantFiyat

        # Caller may pass prefetched; otherwise leave to explicit vf
        vf = None

    if vf is not None and getattr(vf, "durum", None) == "AKTIF":
        model = (getattr(vf, "fiyat_modeli", None) or "").strip().upper()
        if model:
            vf_manual = model in ("SABIT_PARCA", "SABIT")
            urun_manual = urun_model == "SABIT_PARCA"
            return {
                "kaynak": "varyant_fiyat",
                "model": model,
                "conflict": vf_manual != urun_manual,
            }

    return {
        "kaynak": "urun",
        "model": urun_model,
        "conflict": False,
    }


def etkin_fiyat_modeli_for_varyant(varyant) -> dict:
    from fiyatlama.models import VaryantFiyat

    vf = (
        VaryantFiyat.objects.filter(varyant=varyant, durum=VaryantFiyat.Durum.AKTIF)
        .order_by("-versiyon", "-pk")
        .first()
    )
    return etkin_fiyat_modeli(varyant.urun, vf=vf)
