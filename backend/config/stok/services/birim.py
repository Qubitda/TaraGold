"""Stok birimi — fiyat_modeli birincil birimi (teklif yok)."""

from __future__ import annotations

from django.core.exceptions import ValidationError

from stok.birim_constants import StokBirimi

_FIYAT_MODELI_BIRIM = {
    "SABIT_PARCA": StokBirimi.ADET,
    "METAL_BAZLI": StokBirimi.GRAM,
    "GRAM_BIRIM": StokBirimi.GRAM,
}


def birim_from_fiyat_modeli(fiyat_modeli: str) -> str:
    try:
        return _FIYAT_MODELI_BIRIM[fiyat_modeli]
    except KeyError as exc:
        raise ValidationError(
            {
                "fiyat_modeli": (
                    f"Stok birimi eşlemesi yok: {fiyat_modeli!r}."
                )
            }
        ) from exc


def assert_ayni_birim(a: str, b: str, *, context: str = "") -> None:
    if a != b:
        suffix = f" ({context})" if context else ""
        raise ValidationError(
            f"Stok birimleri uyuşmuyor: {a} ≠ {b}{suffix}."
        )
